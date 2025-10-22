import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { HttpClientService } from 'src/common/http-client/http-client.service';
import { transactionSourceChannel } from './constants/transaction-source.channel.constants';

interface GpPaymentConfig {
  baseUrl: string;
  auth: {
    username: string;
    password: string;
  };
  timeout: number;
}

type ChargeRequest = {
  amount: number;
  endUserId: string | null;
  currency: string | undefined;
  description: string | null;
  consentId: string | null;
  validityInDays: number;
  referenceCode: string;
  productId: string;
};

@Injectable()
export class GpPaymentService {
  private readonly config: GpPaymentConfig;
  private readonly GAMES = ['XPGames', 'GameApex'];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: HttpClientService,
    private readonly logger: PinoLogger,
  ) {
    this.config = {
      baseUrl: this.configService.get('GP_BASE_URL') ?? '',
      auth: {
        username: this.configService.get('GP_BASIC_AUTH_USER') ?? '',
        password: this.configService.get('GP_BASIC_AUTH_PASS') ?? '',
      },
      timeout: this.configService.get('GP_TIMEOUT') ?? 5000,
    };
  }

  async charge(data: ChargeRequest): Promise<{
    success: boolean;
    data?: unknown;
    error?: unknown;
  }> {
    try {
      const url = `${this.config.baseUrl}/partner/payment/v1/${data.endUserId}/transactions/amount`;

      const payload = {
        amountTransaction: {
          endUserId: data.endUserId,
          paymentAmount: {
            chargingInformation: {
              amount: data.amount,
              currency: 'BDT',
              description: data.description,
            },
            chargingMetaData: {
              channel: transactionSourceChannel.gp.selfWeb,
              mandateId: {
                renew: true,
                subscription: data.endUserId,
                consentId: data.consentId,
                subscriptionPeriod: this.getSubscriptionPeriod(
                  data.validityInDays,
                ),
              },
              productId: data.productId,
              ...(this.GAMES.includes(data.productId) && {
                purchaseCategoryCode: 'Game',
              }),
            },
          },
          referenceCode: data.referenceCode,
          transactionOperationStatus: 'Charged',
          operatorId: 'GRA-BD',
        },
      };

      const response = await this.httpClient.post(
        url,
        payload,
        this.getAuthHeaders(),
      );

      const isPaymentSuccessful = response.status === 200;

      return {
        success: isPaymentSuccessful,
        data: response.data as unknown,
        error: response.error as unknown,
      };
    } catch (error) {
      this.logger.error(error, 'Catch block error in consent charging');
      throw error;
    }
  }

  private getAuthHeaders() {
    const credentials = `${this.config.auth.username}:${this.config.auth.password}`;
    const encoded = Buffer.from(credentials).toString('base64');

    return {
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
      },
      timeout: this.config.timeout,
    };
  }

  private getSubscriptionPeriod(validity: number) {
    switch (validity) {
      case 1:
        return 'P1D';
      case 7:
        return 'P1W';
      case 30:
        return 'P1M';
      case 180:
        return 'P6M';
      case 365:
        return 'P1Y';
      default:
        return 'P1D';
    }
  }
}
