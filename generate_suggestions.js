// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Get the current URL.
 *
 * @param {function(string)} callback - called when the URL of the current tab
 *   is found.
 */
function getCurrentTabUrl(callback) {
    // Query filter to be passed to chrome.tabs.query - see
    // https://developer.chrome.com/extensions/tabs#method-query
    var queryInfo = {
        active: true,
        currentWindow: true
    };

    chrome.tabs.query(queryInfo, function(tabs) {
        // chrome.tabs.query invokes the callback with a list of tabs that match the
        // query. When the popup is opened, there is certainly a window and at least
        // one tab, so we can safely assume that |tabs| is a non-empty array.
        // A window can only have one active tab at a time, so the array consists of
        // exactly one tab.
        var tab = tabs[0];

        // A tab is a plain object that provides information about the tab.
        // See https://developer.chrome.com/extensions/tabs#type-Tab
        var url = tab.url;

        // tab.url is only available if the "activeTab" permission is declared.
        // If you want to see the URL of other tabs (e.g. after removing active:true
        // from |queryInfo|), then the "tabs" permission is required to see their
        // "url" properties.
        console.assert(typeof url === 'string', 'tab.url should be a string');

        callback(url);
    });

    // Most methods of the Chrome extension APIs are asynchronous. This means that
    // you CANNOT do something like this:
    //
    // var url;
    // chrome.tabs.query(queryInfo, function(tabs) {
    //   url = tabs[0].url;
    // });
    // alert(url); // Shows "undefined", because chrome.tabs.query is async.
}

var port = null;
var GitHub_RE = /https?:\/\/github\.com\/(.*)\/(pulls?|issues?)\/([0-9]+)/;
var index = 0;
var current_suggestions = null;
var how_many = 3;

function displayMessage(text) {
    document.getElementById('response').innerHTML = text;
}

function updateUiState() {
    if (port) {
        document.getElementById('connect-button').style.display = 'none';
        document.getElementById('next-button').style.display = 'none';
        document.getElementById('send-message-button').style.display = 'block';
    } else {
        document.getElementById('connect-button').style.display = 'block';
        document.getElementById('next-button').style.display = 'none';
        document.getElementById('send-message-button').style.display = 'none';
    }
}

function sendNativeMessage() {
    getCurrentTabUrl(function(url) {
        if (url.match(/^https?:\/\/github\.com\/.*\/(pulls?|issues?)\/.*$/)) {
            var repo_issue = url.replace(GitHub_RE, '$1 $2 $3').split(' ');
            var repo = repo_issue[0];
            var type = repo_issue[1];
            var id = repo_issue[2];
            var message = null;
            if (type.match(/pulls?/)) {
                message = {"Repository": repo, "PR": id, 'Issue': null};
            } else {
                message = {"Repository": repo, "PR": null, 'Issue': id};
            }
            console.debug(message);
            port.postMessage(message);
        } else {
            displayMessage('This extension only works on GitHub PR and Issue pages, please navigate to one to use it.')
        }
    });
}

function copyToClipboard(text) {
    const input = document.createElement('input');
    input.style.position = 'fixed';
    input.style.opacity = 0;
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('Copy');
    document.body.removeChild(input);
}

function displayResultsUpTo(max_results_to_show) {
    var html = '<ul>';
    var limit = index + max_results_to_show <= current_suggestions.length ? index + max_results_to_show : current_suggestions.length;
    for (var i = index; i < limit; i++) {
        var suggestion = current_suggestions[i];
        html = html + '<li><a href="https://www.github.com/' + suggestion.Repo + '/issues/' + suggestion.Id + '" target="_blank">'
            + suggestion.Id + ' [' + suggestion.Probability + ']</a><button id="copy-' + suggestion.Id + '">Copy</button></li>'
    }
    html = html + '</ul>';
    console.log(html);
    displayMessage(html);
    console.log(current_suggestions);
    for (i = index; i < limit; i++) {
        var suggestion_link = 'https://www.github.com/' + current_suggestions[i].Repo + '/issues/' + current_suggestions[i].Id;
        document.getElementById('copy-' + current_suggestions[i].Id).addEventListener('click', copyToClipboard(suggestion_link));
        document.getElementById('copy-' + current_suggestions[i].Id).style.display = 'block';
    }
    index = limit % current_suggestions.length;
}


function onNativeMessage(message) {
    if (message.Suggestions.length > 0) {
        current_suggestions = message.Suggestions;
        document.getElementById('send-message-button').style.display = 'none';
        document.getElementById('next-button').style.display = 'block';
        displayResultsUpTo(how_many)
    } else {
        current_suggestions = null;
        displayMessage(message.Error)
    }
}

function onDisconnected() {
    displayMessage("Failed to connect: " + chrome.runtime.lastError.message);
    port = null;
    updateUiState();
}

function connect() {
    document.getElementById('response').innerHTML = '';
    var hostName = "linker";
    port = chrome.runtime.connectNative(hostName);
    port.onMessage.addListener(onNativeMessage);
    port.onDisconnect.addListener(onDisconnected);
    updateUiState();
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('connect-button').addEventListener('click', connect);
    document.getElementById('send-message-button').addEventListener('click', sendNativeMessage);
    document.getElementById('next-button').addEventListener('click', function () {displayResultsUpTo(how_many)});
    updateUiState()
});