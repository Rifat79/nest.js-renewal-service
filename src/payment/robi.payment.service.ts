import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { HttpClientService } from 'src/common/http-client/http-client.service';

interface RobiPaymentServiceConfig {
  baseUrl: string;
  timeout: number;
}

export interface RobiChargeConfig {
  apiKey: string;
  username: string;
  onBehalfOf: string;
  purchaseCategoryCode: string;
  channel: string;
  subscriptionID: string;
  unSubURL: string;
  contactInfo: string;
}

interface RobiChargeResponse {
  transactionOperationStatus?: string;
  [key: string]: unknown;
}

type RobiChargeRequest = {
  description: string;
  currency: string;
  amount: number;
  referenceCode: string;
  msisdn: string;
  config: RobiChargeConfig;
  unSubURL: string;
};

@Injectable()
export class RobiPaymentService {
  private readonly config: RobiPaymentServiceConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: HttpClientService,
    private readonly logger: PinoLogger,
  ) {
    this.config = {
      baseUrl: this.configService.get('ROBI_BASE_URL') ?? '',
      timeout: this.configService.get('ROBI_TIMEOUT') ?? 5000,
    };
  }

  async renewSubscription(data: RobiChargeRequest) {
    const {
      description,
      config,
      currency,
      referenceCode,
      msisdn,
      amount,
      unSubURL,
    } = data;

    try {
      const url = `${this.config.baseUrl}/api/renewSubscription`;

      const payload = {
        apiKey: config.apiKey,
        username: config.username,
        spTransID: referenceCode,
        description,
        currency: currency ?? 'BDT',
        amount: amount,
        onBehalfOf: config.onBehalfOf,
        purchaseCategoryCode: config.purchaseCategoryCode,
        referenceCode,
        channel: config.channel,
        taxAmount: 0,
        msisdn: msisdn,
        operator: 'ROBI',
        subscriptionID: config.subscriptionID,
        unSubURL,
        contactInfo: config.contactInfo,
      };

      const response = await this.httpClient.post(url, payload, {
        timeout: this.config.timeout,
      });
      const responseData = response.data as RobiChargeResponse;

      const isPaymentSuccessful =
        typeof responseData === 'object' &&
        responseData?.transactionOperationStatus?.toLowerCase?.() === 'charged';

      return {
        success: isPaymentSuccessful,
        data: response.data as unknown,
        error: response.error,
        httpStatus: response.status,
        responsePayload: response.data as unknown,
        requestPayload: payload,
        responseDuration: response.duration,
      };
    } catch (error) {
      this.logger.error(error, 'Catch block error in consent charging');
      throw error;
    }
  }
}
