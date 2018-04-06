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

function displayMessage(text) {
    document.getElementById('response').innerHTML = text;
}

function updateUiState() {
    if (port) {
        document.getElementById('connect-button').style.display = 'none';
        document.getElementById('send-message-button').style.display = 'block';
        document.getElementById('record-selected-button').style.display = 'none';
        document.getElementById('update-model-button').style.display = 'block';
    } else {
        document.getElementById('connect-button').style.display = 'block';
        document.getElementById('send-message-button').style.display = 'none';
        document.getElementById('record-selected-button').style.display = 'none';
        document.getElementById('update-model-button').style.display = 'none';
    }
}

function sendPredictionRequest() {
    getCurrentTabUrl(function(url) {
        if (url.match(/^https?:\/\/github\.com\/.*\/(pulls?|issues?)\/.*$/)) {
            var repo_issue = url.replace(GitHub_RE, '$1 $2 $3').split(' ');
            var repo = repo_issue[0];
            var type = repo_issue[1];
            var id = repo_issue[2];
            var message = null;
            if (type.match(/pulls?/)) {
                message = {"Type": "Prediction", "Repository": repo, "PR": id, 'Issue': null, "Threshold": 0.02};
            } else {
                message = {"Type": "Prediction", "Repository": repo, "PR": null, 'Issue': id,  "Threshold": 0.02};
            }
            //console.debug(message);
            port.postMessage(message);
        } else {
            document.getElementById('send-message-button').style.display = 'none';
            displayMessage('This extension only works on GitHub PR and Issue pages, please navigate to one to use it.')
        }
    });
}

function sendModelUpdateRequest() {
    var message = {"Type": "Update"};
    port.postMessage(message);
}

function sendRecordSelectedLinks() {
    var message = {"Type": "LinkUpdate", "Repository": null, "Links": []};
    port.postMessage(message);
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

function displayResults(suggestions) {
    var html = '<table class="TableListJS" id="entries">';
    html = html + '<thead><tr><td width="200">Title</td><td width="20px">Score</td></tr></thead><tbody>';
    for (var i = 0; i < suggestions.length; i++) {
        html = html + '<tr>';
        var suggestion = suggestions[i];
        html = html + '<td width="200px"><a href="https://www.github.com/' + suggestion.Repo + '/issues/'
            + suggestion.Id + '" target="_blank">'
            + suggestion.Title + '</a></td><td width="20px">' + suggestion.Probability + '</td>';
        html = html + '</tr>';
    }
    html = html + '</tbody>';
    displayMessage(html);
}


function onNativeMessage(message) {
    document.getElementById('send-message-button').style.display = 'none';
    document.getElementById('update-model-button').style.display = 'none';
    if (message.Suggestions.length > 0) {
        document.getElementById('record-selected-button').style.display = 'block';
        displayResults(message.Suggestions)
    } else {
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
    document.getElementById('send-message-button').addEventListener('click', sendPredictionRequest);
    document.getElementById('record-selected-button').addEventListener('click', sendRecordSelectedLinks);
    document.getElementById('update-model-button').addEventListener('click', sendModelUpdateRequest);
    updateUiState()
});