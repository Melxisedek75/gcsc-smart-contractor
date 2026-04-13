import { useState, useCallback } from 'react';
import { xprService, XPRIdentity } from '../services/xprService';
import { isValidXPRAccount } from '../utils/formatters';

interface Contact extends XPRIdentity {
  roomId?: string;
}

export const useContacts = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<XPRIdentity | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchUser = useCallback(async (xprAccount: string) => {
    if (!isValidXPRAccount(xprAccount)) {
      setSearchError('Invalid XPR account name (a-z, 1-5, up to 12 chars)');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const identity = await xprService.fetchIdentity(xprAccount);
      if (identity) {
        setSearchResult(identity);
      } else {
        setSearchError('User not found on XPR Network');
      }
    } catch {
      setSearchError('Search failed, please try again');
    } finally {
      setIsSearching(false);
    }
  }, []);

  const addContact = useCallback((contact: Contact) => {
    setContacts((prev) => {
      if (prev.some((c) => c.account === contact.account)) return prev;
      return [...prev, contact];
    });
  }, []);

  const removeContact = useCallback((account: string) => {
    setContacts((prev) => prev.filter((c) => c.account !== account));
  }, []);

  return {
    contacts,
    isSearching,
    searchResult,
    searchError,
    searchUser,
    addContact,
    removeContact,
  };
};
