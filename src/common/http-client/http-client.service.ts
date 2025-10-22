import { HttpService } from '@nestjs/axios';
import { BadGatewayException, HttpStatus, Injectable } from '@nestjs/common';
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { PinoLogger } from 'nestjs-pino';
import { firstValueFrom, Observable, timer } from 'rxjs'; // Added 'timer'
import { catchError, map, retry } from 'rxjs/operators'; // Removed 'delay' operator

// ------------------------------------------
// Custom Exception for External API Failures
// ------------------------------------------
/**
 * Thrown when an external API call fails, standardizing the response status
 * for upstream services (e.g., usually 502 Bad Gateway).
 */
class ExternalApiFailureException extends BadGatewayException {
  constructor(message: string, status = 502) {
    super({ status, message });
    this.name = 'ExternalApiFailureException';
  }
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
    traceId?: string, // Added for microservice tracing and logging correlation
  ): Promise<T> {
    const startTime = Date.now();
    // Use 'N/A' as a fallback for the trace ID to ensure the logging field exists
    const logContext = { url, method, traceId: traceId || 'N/A' };

    const requestObservable: Observable<AxiosResponse<T>> = this.httpService
      .request({
        method,
        url,
        data,
        ...config,
      })
      .pipe(
        // 1. Retry Mechanism with Exponential Backoff
        retry({
          count: 0, // Total 3 retries (4 attempts total)
          delay: (error, retryCount) => {
            // Calculate exponential wait time: 2^n * 1000ms (1s, 2s, 4s)
            const waitTime = Math.pow(2, retryCount) * 1000;

            // Log the retry attempt with the error details
            this.logger.warn(
              { ...logContext, error: error.message, retryCount },
              `Request failed (${error.message}). Retrying in ${waitTime}ms...`,
            );
            return timer(waitTime); // FIX: Use timer() to return ObservableInput<any>
          },
        }),

        // 2. Logging and Final Error Handling (after all retries fail)
        catchError((err: AxiosError) => {
          // Renamed 'error' to 'err' to prevent shadowing issues
          const duration = Date.now() - startTime;

          // Determine the status code for standardized error reporting
          const responseStatus = err.response?.status;
          const statusCode = responseStatus
            ? responseStatus
            : HttpStatus.BAD_GATEWAY; // Default to 502 for network failures/timeouts

          // Log the final failure
          this.logger.error(
            {
              ...logContext,
              status: statusCode,
              duration,
              code: err.code, // Axios error code (e.g., ECONNABORTED, ENOTFOUND)
              message: err.message,
            },
            `External API call failed permanently after ${duration}ms.`,
          );

          // Throw a standardized exception
          throw new ExternalApiFailureException(
            `[${method.toUpperCase()} ${url}] failed with status: ${statusCode}`,
            statusCode,
          );
        }),

        // 3. Extract data only if request was successful (2xx)
        map((response) => response.data),
      );

    // Convert the Observable into a Promise for async/await use
    const result = await firstValueFrom(requestObservable);

    const duration = Date.now() - startTime;
    this.logger.info(
      { ...logContext, duration, status: 200 },
      `External API call successful in ${duration}ms.`,
    );

    return result as T;
  }

  // ------------------------------------------
  // Public Methods (Wrapper)
  // ------------------------------------------

  /** Executes a GET request. */
  get<T = any>(
    url: string,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<T> {
    return this.execute('get', url, config, undefined, traceId);
  }

  /** Executes a POST request. */
  post<T = any>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<T> {
    return this.execute('post', url, config, data, traceId);
  }

  /** Executes a PUT request. */
  put<T = any>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<T> {
    return this.execute('put', url, config, data, traceId);
  }

  /** Executes a DELETE request. */
  delete<T = any>(
    url: string,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<T> {
    return this.execute('delete', url, config, undefined, traceId);
  }

  /** Executes a PATCH request. */
  patch<T = any>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
    traceId?: string,
  ): Promise<T> {
    return this.execute('patch', url, config, data, traceId);
  }
}
