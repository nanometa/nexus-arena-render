import { createClient } from '@supabase/supabase-js';

const projectUrl =
  process.env.REACT_APP_SUPABASE_URL || 'https://hqmnybdqtmssqxuqwghg.supabase.co';
const publishableKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const isSupabaseConfigured = Boolean(projectUrl && publishableKey);

export const supabase = createClient(projectUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'nexus-arena-auth-v2',
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export async function requireSupabaseSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('Wallet session expired. Connect your wallet again.');
  return data.session;
}

export function walletFromSupabaseUser(user) {
  const web3Subject = String(user?.user_metadata?.sub || '');
  const subjectMatch = /^web3:ethereum:(0x[a-fA-F0-9]{40})$/.exec(web3Subject);
  const subjectWallet = subjectMatch?.[1]?.toLowerCase() || '';
  const claimedAddress = String(user?.user_metadata?.custom_claims?.address || '');
  const claimedWallet = /^0x[a-fA-F0-9]{40}$/.test(claimedAddress)
    ? claimedAddress.toLowerCase()
    : '';

  if (!subjectWallet || (claimedWallet && claimedWallet !== subjectWallet)) return '';
  return subjectWallet;
}

export async function invokeNexus(action, payload = {}, { authenticated = true } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  if (authenticated) await requireSupabaseSession();

  const { data, error } = await supabase.functions.invoke('nexus-api', {
    body: { action, ...payload },
  });
  if (error) {
    let message = error.message || 'Nexus service unavailable';
    try {
      const details = await error.context?.json();
      if (details?.error) message = details.error;
    } catch (readError) {
      // The transport message is still useful when the response has no JSON body.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function signInWithWallet(wallet, expectedAddress = '') {
  if (!wallet?.request) throw new Error('Install MetaMask or another EVM wallet.');
  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: 'ethereum',
    wallet,
    statement: 'Sign in to Nexus Arena. This request does not trigger a transaction.',
    options: { url: `${window.location.origin}/` },
  });
  if (error) throw error;
  const authenticatedWallet = walletFromSupabaseUser(data.user);
  if (!authenticatedWallet) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('Supabase did not return a valid Ethereum wallet identity.');
  }
  if (expectedAddress && authenticatedWallet !== String(expectedAddress).toLowerCase()) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('The authenticated wallet does not match the selected wallet.');
  }
  return data.session;
}

export async function signOutWalletSession() {
  await supabase.auth.signOut({ scope: 'local' });
}
