'use strict';

const httpAuth = {};

httpAuth.requests = [];
httpAuth.pendingCallbacks = [];

httpAuth.init = function() {
    let handleReq = httpAuth.handleRequestPromise;
    let reqType = 'blocking';

    if (!isFirefox()) {
        handleReq = httpAuth.handleRequestCallback;
        reqType = 'asyncBlocking';
    }

    // Only intercept http auth requests if the option is turned on.
    if (page.settings.autoFillAndSend && !browser.webRequest.onAuthRequired.hasListener(handleReq)) {
        const opts = { urls: [ '<all_urls>' ] };

        browser.webRequest.onAuthRequired.addListener(handleReq, opts, [ reqType ]);
        browser.webRequest.onCompleted.addListener(httpAuth.requestCompleted, opts);
        browser.webRequest.onErrorOccurred.addListener(httpAuth.requestCompleted, opts);
    } else if (browser.webRequest.onAuthRequired.hasListener(handleReq)) {
        browser.webRequest.onAuthRequired.removeListener(handleReq);
        browser.webRequest.onCompleted.removeListener(httpAuth.requestCompleted);
        browser.webRequest.onErrorOccurred.removeListener(httpAuth.requestCompleted);
    }
};

httpAuth.requestCompleted = function(details) {
    const index = httpAuth.requests.indexOf(details.requestId);
    if (index >= 0) {
        httpAuth.requests.splice(index, 1);
    }
};

httpAuth.handleRequestPromise = function(details) {
    return new Promise((resolve, reject) => {
        httpAuth.processPendingCallbacks(details, resolve, reject);
    });
};

httpAuth.handleRequestCallback = function(details, callback) {
    httpAuth.processPendingCallbacks(details, callback, callback);
};

httpAuth.retrieveCredentials = async function(tabId, url, submitUrl) {
    return await keepass.retrieveCredentials(tabId, [ url, submitUrl, false, true ]).catch((err) => {
        console.log('httpAuth.retrieveCredentials error: ' + err);
        return Promise.reject();
    });
};

httpAuth.processPendingCallbacks = async function(details, resolve, reject) {
    if (httpAuth.requests.indexOf(details.requestId) >= 0 || !page.tabs[details.tabId]) {
        reject({ cancel: false });
        return;
    }

    httpAuth.requests.push(details.requestId);

    if (details.challenger) {
        details.proxyUrl = details.challenger.host;
    }

    details.searchUrl = (details.isProxy && details.proxyUrl) ? details.proxyUrl : details.url;

    const logins = await httpAuth.retrieveCredentials({ 'id': details.tabId }, details.searchUrl, details.searchUrl);
    httpAuth.loginOrShowCredentials(logins, details, resolve, reject);
};

httpAuth.loginOrShowCredentials = function(logins, details, resolve, reject) {
    // At least one login found --> use first to login
    if (logins.length > 0 && page.settings.autoFillAndSend) {
        if (logins.length === 1) {
            resolve({
                authCredentials: {
                    username: logins[0].login,
                    password: logins[0].password
                }
            });
        } else {
            if (page.settings.showNotifications) {
                showNotification(tr('multipleCredentialsDetected'));
            }
            kpxcEvent.onHTTPAuthPopup({ 'id': details.tabId }, { 'logins': logins, 'details': details, 'resolve': resolve, 'reject': reject });
        }
    } else {
        reject({ cancel: false }); // No logins found
    }
};
