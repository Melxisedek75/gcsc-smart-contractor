import {
  Contract,
  Name,
  TableStore,
  EMPTY_NAME,
  check,
  requireAuth,
  print,
} from 'proton-tsc';
import { Asset, Symbol } from 'proton-tsc/token';

// ─────────────────────────────────────────────────────────────────────────────
// XPRC — XPR Chat in-app token
// Wraps native XPR for chat-specific micro-transactions:
//  • Chat tips (sub-cent amounts)
//  • Premium features
//  • Creator subscriptions
// ─────────────────────────────────────────────────────────────────────────────

// @table accounts
class Account {
  constructor(
    public balance: Asset = new Asset(0, new Symbol('XPRC', 4)),
  ) {}

  @primary
  get primary(): u64 {
    return this.balance.symbol.code();
  }
}

// @table stat
class CurrencyStat {
  constructor(
    public supply: Asset = new Asset(0, new Symbol('XPRC', 4)),
    public max_supply: Asset = new Asset(0, new Symbol('XPRC', 4)),
    public issuer: Name = EMPTY_NAME,
  ) {}

  @primary
  get primary(): u64 {
    return this.supply.symbol.code();
  }
}

@contract
class XPRCToken extends Contract {
  // ── create: mint the token ─────────────────────────────────────────────────
  @action('create')
  create(issuer: Name, max_supply: Asset): void {
    requireAuth(this.receiver);

    const sym = max_supply.symbol;
    check(sym.isValid(), 'Invalid symbol name');
    check(max_supply.isValid(), 'Invalid supply');
    check(max_supply.amount > 0, 'Max supply must be positive');

    const stats = new TableStore<CurrencyStat>(this.receiver, Name.fromU64(sym.code()));
    check(!stats.get(sym.code()), 'Token already exists');

    stats.store(
      new CurrencyStat(
        new Asset(0, sym),
        max_supply,
        issuer
      ),
      this.receiver
    );
  }

  // ── issue: mint tokens to account ─────────────────────────────────────────
  @action('issue')
  issue(to: Name, quantity: Asset, memo: string): void {
    const sym = quantity.symbol;
    check(sym.isValid(), 'Invalid symbol');
    check(memo.length <= 256, 'Memo too long');

    const stats = new TableStore<CurrencyStat>(this.receiver, Name.fromU64(sym.code()));
    const stat = stats.requireGet(sym.code(), 'Token does not exist');

    requireAuth(stat.issuer);
    check(quantity.isValid(), 'Invalid quantity');
    check(quantity.amount > 0, 'Quantity must be positive');
    check(quantity.symbol.code() === stat.supply.symbol.code(), 'Symbol mismatch');
    check(
      quantity.amount <= stat.max_supply.amount - stat.supply.amount,
      'Exceeds max supply'
    );

    stat.supply.amount += quantity.amount;
    stats.update(stat, stat.issuer);

    this._addBalance(to, quantity, stat.issuer);
    print(`Issued ${quantity} XPRC to @${to}`);
  }

  // ── transfer: send tokens ──────────────────────────────────────────────────
  @action('transfer')
  transfer(from: Name, to: Name, quantity: Asset, memo: string): void {
    check(from !== to, 'Cannot transfer to self');
    requireAuth(from);
    check(memo.length <= 256, 'Memo too long');

    const sym = quantity.symbol;
    const stats = new TableStore<CurrencyStat>(this.receiver, Name.fromU64(sym.code()));
    const stat = stats.requireGet(sym.code(), 'Token does not exist');

    check(quantity.isValid(), 'Invalid quantity');
    check(quantity.amount > 0, 'Quantity must be positive');
    check(quantity.symbol.code() === stat.supply.symbol.code(), 'Symbol mismatch');

    this._subBalance(from, quantity);
    this._addBalance(to, quantity, from);

    print(`Transfer ${quantity} XPRC: @${from} → @${to} (${memo})`);
  }

  // ── burn: destroy tokens ───────────────────────────────────────────────────
  @action('burn')
  burn(owner: Name, quantity: Asset): void {
    requireAuth(owner);

    const sym = quantity.symbol;
    const stats = new TableStore<CurrencyStat>(this.receiver, Name.fromU64(sym.code()));
    const stat = stats.requireGet(sym.code(), 'Token does not exist');

    check(quantity.isValid() && quantity.amount > 0, 'Invalid quantity');
    check(quantity.symbol.code() === stat.supply.symbol.code(), 'Symbol mismatch');

    stat.supply.amount -= quantity.amount;
    stats.update(stat, this.receiver);

    this._subBalance(owner, quantity);
    print(`Burned ${quantity} XPRC from @${owner}`);
  }

  // ── Private helpers ────────────────────────────────────────────────────────
  private _subBalance(owner: Name, value: Asset): void {
    const table = new TableStore<Account>(this.receiver, owner);
    const from = table.requireGet(value.symbol.code(), 'Insufficient balance');
    check(from.balance.amount >= value.amount, 'Insufficient balance');
    from.balance.amount -= value.amount;
    if (from.balance.amount === 0) {
      table.remove(from);
    } else {
      table.update(from, owner);
    }
  }

  private _addBalance(owner: Name, value: Asset, payer: Name): void {
    const table = new TableStore<Account>(this.receiver, owner);
    const to = table.get(value.symbol.code());
    if (!to) {
      table.store(new Account(value), payer);
    } else {
      to.balance.amount += value.amount;
      table.update(to, owner);
    }
  }
}
