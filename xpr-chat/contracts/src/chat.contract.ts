import {
  Contract,
  Name,
  TableStore,
  EMPTY_NAME,
  check,
  requireAuth,
  sendTransaction,
  print,
} from 'proton-tsc';
import {
  Asset,
  Symbol,
  Transfer,
  Token,
} from 'proton-tsc/token';

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

// @table identities
class Identity {
  constructor(
    public account: Name = EMPTY_NAME,
    public display_name: string = '',
    public avatar_ipfs: string = '',
    public signal_pub_key: string = '',
    public created_at: u64 = 0,
    public updated_at: u64 = 0,
  ) {}

  @primary
  get primary(): u64 {
    return this.account.value;
  }
}

// @table groups
class Group {
  constructor(
    public id: u64 = 0,
    public name: string = '',
    public description: string = '',
    public avatar_ipfs: string = '',
    public creator: Name = EMPTY_NAME,
    public members_count: u32 = 0,
    public created_at: u64 = 0,
    public is_public: boolean = false,
  ) {}

  @primary
  get primary(): u64 {
    return this.id;
  }
}

// @table groupmembers
class GroupMember {
  constructor(
    public id: u64 = 0,       // composite of group_id + account
    public group_id: u64 = 0,
    public account: Name = EMPTY_NAME,
    public role: u8 = 0,      // 0=member, 1=admin, 2=owner
    public joined_at: u64 = 0,
  ) {}

  @primary
  get primary(): u64 {
    return this.id;
  }
}

// @table rewards
class Reward {
  constructor(
    public account: Name = EMPTY_NAME,
    public total_received: u64 = 0,
    public last_rewarded_at: u64 = 0,
  ) {}

  @primary
  get primary(): u64 {
    return this.account.value;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────
@contract
class XPRChat extends Contract {
  identitiesTable: TableStore<Identity> = new TableStore<Identity>(
    this.receiver,
    this.receiver
  );

  groupsTable: TableStore<Group> = new TableStore<Group>(
    this.receiver,
    this.receiver
  );

  rewardsTable: TableStore<Reward> = new TableStore<Reward>(
    this.receiver,
    this.receiver
  );

  // ── setidentity ────────────────────────────────────────────────────────────
  // Register or update user identity + Signal public key on-chain
  @action('setidentity')
  setIdentity(
    account: Name,
    display_name: string,
    avatar_ipfs: string,
    signal_pub_key: string,
  ): void {
    requireAuth(account);

    check(display_name.length <= 64, 'display_name too long');
    check(avatar_ipfs.length <= 128, 'avatar_ipfs too long');
    check(signal_pub_key.length <= 256, 'signal_pub_key too long');

    const existing = this.identitiesTable.get(account.value);
    const now = <u64>Date.now();

    if (existing) {
      existing.display_name = display_name;
      existing.avatar_ipfs = avatar_ipfs;
      existing.signal_pub_key = signal_pub_key;
      existing.updated_at = now;
      this.identitiesTable.update(existing, account);
    } else {
      const identity = new Identity(
        account,
        display_name,
        avatar_ipfs,
        signal_pub_key,
        now,
        now,
      );
      this.identitiesTable.store(identity, account);
    }

    print(`Identity set for @${account}`);
  }

  // ── creategroup ────────────────────────────────────────────────────────────
  // Create a new group chat
  @action('creategroup')
  createGroup(
    creator: Name,
    name: string,
    description: string,
    is_public: boolean,
  ): void {
    requireAuth(creator);

    check(name.length >= 2 && name.length <= 64, 'Invalid group name length');
    check(description.length <= 256, 'Description too long');

    // Use current timestamp as ID
    const id = <u64>Date.now();

    const group = new Group(
      id,
      name,
      description,
      '',
      creator,
      1,
      id,
      is_public,
    );

    this.groupsTable.store(group, creator);

    print(`Group "${name}" created with ID ${id}`);
  }

  // ── rewarduser ─────────────────────────────────────────────────────────────
  // Send XPR reward to active user (called by contract account)
  @action('rewarduser')
  rewardUser(account: Name, amount: u64): void {
    requireAuth(this.receiver);

    check(amount > 0 && amount <= 10000_0000, 'Invalid reward amount'); // max 1000 XPR

    const reward = this.rewardsTable.get(account.value);
    const now = <u64>Date.now();

    if (reward) {
      // Cooldown: max 1 reward per 24 hours
      check(
        now - reward.last_rewarded_at >= 86400000,
        'Reward cooldown: 24 hours between rewards'
      );
      reward.total_received += amount;
      reward.last_rewarded_at = now;
      this.rewardsTable.update(reward, this.receiver);
    } else {
      this.rewardsTable.store(
        new Reward(account, amount, now),
        this.receiver
      );
    }

    // Transfer XPR from contract to user
    const quantity = new Asset(
      <i64>amount,
      new Symbol('XPR', 4)
    );

    sendTransaction(
      this.receiver,
      Name.fromString('eosio.token'),
      Name.fromString('transfer'),
      {
        from: this.receiver,
        to: account,
        quantity,
        memo: 'XPR Chat activity reward',
      }
    );

    print(`Rewarded @${account} with ${amount} XPR`);
  }
}
