import { HttpService } from '@nestjs/axios';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { PinoLogger } from 'nestjs-pino';
import { firstValueFrom, Observable, of, timer } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';

// ------------------------------------------
// Custom Exception for External API Failures
// ------------------------------------------
/**
 * Thrown when an external API call fails, standardizing the response status
 * for upstream services (e.g., usually 502 Bad Gateway).
 */

export interface HttpCallError {
  code?: string;
  message?: string;
}
export interface HttpCallResult<T> {
  status: number;
  data: T | null;
  headers: any;
  error?: HttpCallError;
  duration: number;
}

@Injectable()
export class HttpClientService {
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: PinoLogger,
  ) {
    // Set the context once for all logs from this service
    this.logger.setContext(HttpClientService.name);
  }

  /**
   * Core execution method with production-grade practices.
   * Includes logging, retry, standardized error handling, and trace ID propagation.
   */
  private async execute<T>(
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    url: string,
    config: AxiosRequestConfig = {},
    data?: any,
    traceId?: string,
  ): Promise<HttpCallResult<T>> {
    const startTime = Date.now();
    const logContext = { url, method, traceId: traceId || 'N/A' };

    const requestObservable: Observable<HttpCallResult<T>> = this.httpService
      .request({
        method,
        url,
        data,
        ...config,
      })
      .pipe(
        retry({
          count: 0,
          delay: (error, retryCount) => {
            const waitTime = Math.pow(2, retryCount) * 1000;
            this.logger.warn(
              { ...logContext, error: error.message, retryCount },
              `Request failed (${error.message}). Retrying in ${waitTime}ms...`,
            );
            return timer(waitTime);
          },
        }),
        map((axiosResponse) => {
          // Map AxiosResponse to your HttpCallResult<T>
          return {
            status: axiosResponse.status,
            data: axiosResponse.data,
            headers: axiosResponse.headers,
            duration: Date.now() - startTime, // you might want to calculate this here or after subscription
          } as HttpCallResult<T>;
        }),
        catchError((err: AxiosError) => {
          const duration = Date.now() - startTime;
          const statusCode = err.response?.status ?? HttpStatus.GATEWAY_TIMEOUT;

          this.logger.error(
            {
              ...logContext,
              duration,
              status: statusCode,
              code: err.code,
              message: err.message,
            },
            `External API call failed permanently after ${duration}ms.`,
          );

          return of<HttpCallResult<T>>({
            status: statusCode,
            duration,
            data: (err.response?.data ?? null) as T | null,
            headers: err.response?.headers ?? {},
            error: {
              code: err.code,
              message: err.message,
            },
          });
        }),
      );

    const response = await firstValueFrom(requestObservable);

    // Only log success if no error is present
    if (!('error' in response)) {
      this.logger.info(
        { ...logContext, duration: response.duration, status: response.status },
        `External API call successful in ${response.duration}ms.`,
      );
    }

    return response;
  }

  // ------------------------------------------
  // Public Methods (Wrapper)
  // ------------------------------------------

  /** Executes a GET request. */
  get<T = any>(
    url: string,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<HttpCallResult<T>> {
    return this.execute('get', url, config, undefined, traceId);
  }

  /** Executes a POST request. */
  post<T = any>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<HttpCallResult<T>> {
    return this.execute('post', url, config, data, traceId);
  }

  /** Executes a PUT request. */
  put<T = any>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<HttpCallResult<T>> {
    return this.execute('put', url, config, data, traceId);
  }

  /** Executes a DELETE request. */
  delete<T = any>(
    url: string,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<HttpCallResult<T>> {
    return this.execute('delete', url, config, undefined, traceId);
  }

  /** Executes a PATCH request. */
  patch<T = any>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<HttpCallResult<T>> {
    return this.execute('patch', url, config, data, traceId);
  }
}
