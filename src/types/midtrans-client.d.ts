declare module 'midtrans-client' {
  interface ClientOptions {
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }

  interface TransactionDetails {
    order_id: string;
    gross_amount: number;
  }

  interface SnapTransactionParams {
    transaction_details: TransactionDetails;
    item_details?: Array<{
      id: string;
      price: number;
      quantity: number;
      name: string;
    }>;
    customer_details?: {
      first_name?: string;
      email?: string;
    };
    [key: string]: unknown;
  }

  interface SnapResponse {
    token: string;
    redirect_url: string;
  }

  class Snap {
    constructor(options: ClientOptions);
    createTransaction(params: SnapTransactionParams): Promise<SnapResponse>;
  }

  class CoreApi {
    constructor(options: ClientOptions);
    transaction: {
      notification(payload: unknown): Promise<Record<string, unknown>>;
      status(orderId: string): Promise<Record<string, unknown>>;
    };
  }

  const _default: { Snap: typeof Snap; CoreApi: typeof CoreApi };
  export default _default;
}
