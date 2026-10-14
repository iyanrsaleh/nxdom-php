/**
 * NexaFetch - Simplified Fetch API wrapper for Nexa UI
 * Provides easy-to-use methods for HTTP requests with automatic JSON handling,
 * error handling, loading states, and request/response interceptors
 */
export class NexaFetch {
  constructor(options = {}) {
    this.baseURL = options.baseURL || "";
    this.defaultHeaders = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    this.timeout = options.timeout || 30000;
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.loadingCallbacks = [];
    this.errorCallbacks = [];
  }

  /**
   * Add request interceptor
   * @param {Function} interceptor - Function to modify request config
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   * @param {Function} interceptor - Function to modify response
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Add loading state callback
   * @param {Function} callback - Function called when loading state changes
   */
  onLoading(callback) {
    this.loadingCallbacks.push(callback);
  }

  /**
   * Add error callback
   * @param {Function} callback - Function called when error occurs
   */
  onError(callback) {
    this.errorCallbacks.push(callback);
  }

  /**
   * Trigger loading callbacks
   * @param {boolean} isLoading - Loading state
   */
  _triggerLoading(isLoading) {
    this.loadingCallbacks.forEach((callback) => {
      try {
        callback(isLoading);
      } catch (error) {
        // Silent error handling
      }
    });
  }

  /**
   * Trigger error callbacks
   * @param {Error} error - Error object
   */
  _triggerError(error) {
    this.errorCallbacks.forEach((callback) => {
      try {
        callback(error);
      } catch (err) {
        // Silent error handling
      }
    });
  }

  /**
   * Normalize URL: fix double slashes, ensure HTTPS if page is HTTPS
   * @param {string} url - URL to normalize
   * @returns {string} Normalized URL
   */
  _normalizeUrl(url) {
    if (!url) return url;
    
    // Ensure HTTPS if page is loaded over HTTPS
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      url = url.replace(/^http:\/\//i, 'https://');
    }
    
    // Fix double slashes (except after protocol like http:// or https://)
    url = url.replace(/([^:]\/)\/+/g, '$1');
    
    return url;
  }

  /**
   * Build full URL
   * @param {string} url - Endpoint URL
   * @returns {string} Full URL
   */
  _buildURL(url) {
    let fullUrl;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      fullUrl = url;
    } else {
      fullUrl = this.baseURL + url;
    }
    // Normalize the URL before returning
    return this._normalizeUrl(fullUrl);
  }

  /**
   * Apply request interceptors
   * @param {Object} config - Request configuration
   * @returns {Object} Modified configuration
   */
  _applyRequestInterceptors(config) {
    return this.requestInterceptors.reduce((acc, interceptor) => {
      return interceptor(acc) || acc;
    }, config);
  }

  /**
   * Apply response interceptors
   * @param {Response} response - Fetch response
   * @returns {Response} Modified response
   */
  _applyResponseInterceptors(response) {
    return this.responseInterceptors.reduce((acc, interceptor) => {
      return interceptor(acc) || acc;
    }, response);
  }

  /**
   * Create timeout promise
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise} Timeout promise
   */
  _createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Core fetch method
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @returns {Promise} Response promise
   */
  async _fetch(url, options = {}) {
    const config = {
      url: this._buildURL(url),
      method: options.method || "GET",
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
      ...options,
    };

    // Apply request interceptors
    const finalConfig = this._applyRequestInterceptors(config);

    this._triggerLoading(true);

    try {
      const fetchPromise = fetch(finalConfig.url, {
        method: finalConfig.method,
        headers: finalConfig.headers,
        body: finalConfig.body,
        mode: finalConfig.mode,
        credentials: finalConfig.credentials,
        cache: finalConfig.cache,
        redirect: finalConfig.redirect,
        referrer: finalConfig.referrer,
        referrerPolicy: finalConfig.referrerPolicy,
        integrity: finalConfig.integrity,
        keepalive: finalConfig.keepalive,
        signal: finalConfig.signal,
      });

      const timeoutPromise = this._createTimeoutPromise(this.timeout);
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        // Try to get detailed error message from response body
        let errorMessage = `HTTP Error: ${response.status} ${response.statusText}`;
        let errorDetails = null;

        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            errorDetails = await response.json();
            if (errorDetails.message) {
              errorMessage += ` - ${errorDetails.message}`;
            } else if (errorDetails.error) {
              errorMessage += ` - ${errorDetails.error}`;
            } else if (typeof errorDetails === "string") {
              errorMessage += ` - ${errorDetails}`;
            }
          } else {
            const textResponse = await response.text();
            if (textResponse && textResponse.trim().length > 0) {
              errorMessage += ` - ${textResponse.substring(0, 200)}`;
            }
          }
        } catch (parseError) {
          // Silent error parsing failure
        }

        const error = new Error(errorMessage);
        error.status = response.status;
        error.statusText = response.statusText;
        error.details = errorDetails;
        error.response = response;
        throw error;
      }

      // Apply response interceptors
      const finalResponse = this._applyResponseInterceptors(response);

      return finalResponse;
    } catch (error) {
      this._triggerError(error);
      throw error;
    } finally {
      this._triggerLoading(false);
    }
  }

  /**
   * GET request
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async get(url, options = {}) {
    const response = await this._fetch(url, { ...options, method: "GET" });
    return this._parseResponse(response);
  }

  /**
   * POST request
   * @param {string} url - Request URL
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async post(url, data = null, options = {}) {
    const config = {
      ...options,
      method: "POST",
    };

    if (data) {
      config.body = this._prepareBody(data, options.headers);
    }

    const response = await this._fetch(url, config);
    return this._parseResponse(response);
  }

  /**
   * PUT request
   * @param {string} url - Request URL
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async put(url, data = null, options = {}) {
    const config = {
      ...options,
      method: "PUT",
    };

    if (data) {
      config.body = this._prepareBody(data, options.headers);
    }

    const response = await this._fetch(url, config);
    return this._parseResponse(response);
  }

  /**
   * PATCH request
   * @param {string} url - Request URL
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async patch(url, data = null, options = {}) {
    const config = {
      ...options,
      method: "PATCH",
    };

    if (data) {
      config.body = this._prepareBody(data, options.headers);
    }

    const response = await this._fetch(url, config);
    return this._parseResponse(response);
  }

  /**
   * DELETE request
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async delete(url, options = {}) {
    const response = await this._fetch(url, { ...options, method: "DELETE" });
    return this._parseResponse(response);
  }

  /**
   * Upload file
   * @param {string} url - Upload URL
   * @param {FormData|File} data - File data
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async upload(url, data, options = {}) {
    const config = {
      ...options,
      method: "POST",
      headers: {
        // Remove Content-Type for FormData to let browser set it with boundary
        ...options.headers,
      },
    };

    // Remove Content-Type for file uploads
    if (data instanceof FormData || data instanceof File) {
      delete config.headers["Content-Type"];
    }

    if (data instanceof File) {
      const formData = new FormData();
      formData.append("file", data);
      config.body = formData;
    } else {
      config.body = data;
    }

    const response = await this._fetch(url, config);
    return this._parseResponse(response);
  }

  /**
   * Prepare request body
   * @param {*} data - Request data
   * @param {Object} headers - Request headers
   * @returns {string|FormData} Prepared body
   */
  _prepareBody(data, headers = {}) {
    if (
      data instanceof FormData ||
      data instanceof File ||
      data instanceof Blob
    ) {
      return data;
    }

    if (typeof data === "string") {
      return data;
    }

    // Check if content type is explicitly set to form data
    const contentType = headers["Content-Type"] || headers["content-type"];
    if (
      contentType &&
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      return new URLSearchParams(data).toString();
    }

    // Default to JSON
    return JSON.stringify(data);
  }

  /**
   * Parse response based on content type
   * @param {Response} response - Fetch response
   * @returns {Promise} Parsed response data
   */
  async _parseResponse(response) {
    const contentType = response.headers.get("content-type");

    if (!contentType) {
      return response.text();
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    if (contentType.includes("text/")) {
      return response.text();
    }

    if (
      contentType.includes("application/octet-stream") ||
      contentType.includes("image/") ||
      contentType.includes("video/") ||
      contentType.includes("audio/")
    ) {
      return response.blob();
    }

    return response.text();
  }

  /**
   * Create a new instance with different configuration
   * @param {Object} options - Configuration options
   * @returns {NexaFetch} New instance
   */
  create(options = {}) {
    return new NexaFetch({
      baseURL: this.baseURL,
      headers: this.defaultHeaders,
      timeout: this.timeout,
      ...options,
    });
  }

  /**
   * Set default headers
   * @param {Object} headers - Headers to set
   */
  setHeaders(headers) {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  /**
   * Set authorization header
   * @param {string} token - Authorization token
   * @param {string} type - Token type (Bearer, Basic, etc.)
   */
  setAuth(token, type = "Bearer") {
    this.setHeaders({
      Authorization: `${type} ${token}`,
    });
  }

  /**
   * Remove authorization header
   */
  removeAuth() {
    delete this.defaultHeaders["Authorization"];
  }

  /**
   * Set base URL
   * @param {string} baseURL - Base URL
   */
  setBaseURL(baseURL) {
    this.baseURL = baseURL;
  }

  /**
   * Set timeout
   * @param {number} timeout - Timeout in milliseconds
   */
  setTimeout(timeout) {
    this.timeout = timeout;
  }
}

// Create default instance
export const nexaFetch = new NexaFetch();

// Export default instance
export default nexaFetch;
