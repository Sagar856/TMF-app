export interface WalletParseResult {
  isWallet: boolean;
  walletName?: string;
  payeeOrPayer?: string;
}

export function parseWalletFormat(text: string): WalletParseResult {
  const lower = text.toLowerCase();

  if (lower.includes('wallet') || lower.includes('paytm wallet') || lower.includes('amazon pay balance') || lower.includes('mobikwik')) {
    let walletName = 'Digital Wallet';
    if (lower.includes('paytm')) walletName = 'Paytm Wallet';
    else if (lower.includes('phonepe')) walletName = 'PhonePe Wallet';
    else if (lower.includes('amazon')) walletName = 'Amazon Pay Balance';
    else if (lower.includes('mobikwik')) walletName = 'Mobikwik Wallet';

    const payeeMatch = text.match(/(?:paid to|sent to|at|for)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+from|\s+using|\.|$)/i);
    const payeeOrPayer = payeeMatch && payeeMatch[1] ? payeeMatch[1].trim() : undefined;

    return {
      isWallet: true,
      walletName,
      payeeOrPayer,
    };
  }

  return { isWallet: false };
}
