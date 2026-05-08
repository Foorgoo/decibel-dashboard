import { Account, AccountAddress, Aptos, AptosConfig, InputGenerateTransactionPayloadData, Network, type AccountAuthenticator, type AnyRawTransaction } from '@aptos-labs/ts-sdk';
import { GasStationClient } from '@aptos-labs/gas-station-client';
import { MAINNET_CONFIG } from '@decibeltrade/sdk';

interface SubmitGasStationTransactionArgs {
  apiKey?: string;
  gasStationApiKey: string;
  signer: Account;
  data: InputGenerateTransactionPayloadData;
}

interface SubmitOwnerFeePayerTransactionArgs {
  apiKey?: string;
  signer: Account;
  feePayerAddress: string;
  data: InputGenerateTransactionPayloadData;
  signFeePayerTransaction: (args: {
    transactionOrPayload: AnyRawTransaction;
    asFeePayer?: boolean;
  }) => Promise<{ authenticator: AccountAuthenticator; rawTransaction: Uint8Array }>;
}

const createAptosClient = (apiKey?: string) => new Aptos(new AptosConfig({
  network: Network.MAINNET,
  fullnode: MAINNET_CONFIG.fullnodeUrl,
  clientConfig: apiKey ? { API_KEY: apiKey } : undefined,
}));

export const formatTradingError = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error, (_key, value) => (
      typeof value === 'bigint' ? value.toString() : value
    ));
  } catch {
    return 'Unknown error';
  }
};

export const submitGasStationTransaction = async ({
  apiKey,
  gasStationApiKey,
  signer,
  data,
}: SubmitGasStationTransactionArgs) => {
  const aptos = createAptosClient(apiKey);

  const transaction = await aptos.transaction.build.simple({
    sender: signer.accountAddress,
    withFeePayer: true,
    data,
  });
  const senderAuthenticator = aptos.transaction.sign({
    signer,
    transaction,
  });

  const gasStationClient = new GasStationClient({
    network: Network.MAINNET,
    baseUrl: MAINNET_CONFIG.gasStationUrl,
    apiKey: gasStationApiKey,
  });

  const result = await gasStationClient.signAndSubmitTransaction({
    transaction,
    senderAuthenticator,
  });

  await aptos.waitForTransaction({
    transactionHash: result.transactionHash,
    options: { checkSuccess: true },
  });

  return result.transactionHash;
};

export const submitOwnerFeePayerTransaction = async ({
  apiKey,
  signer,
  feePayerAddress,
  data,
  signFeePayerTransaction,
}: SubmitOwnerFeePayerTransactionArgs) => {
  const aptos = createAptosClient(apiKey);

  const transaction = await aptos.transaction.build.simple({
    sender: signer.accountAddress,
    withFeePayer: true,
    data,
  });
  transaction.feePayerAddress = AccountAddress.from(feePayerAddress);
  const senderAuthenticator = aptos.transaction.sign({
    signer,
    transaction,
  });
  const feePayerResponse = await signFeePayerTransaction({
    transactionOrPayload: transaction,
    asFeePayer: true,
  });

  const result = await aptos.transaction.submit.simple({
    transaction,
    senderAuthenticator,
    feePayerAuthenticator: feePayerResponse.authenticator,
  });

  await aptos.waitForTransaction({
    transactionHash: result.hash,
    options: { checkSuccess: true },
  });

  return result.hash;
};
