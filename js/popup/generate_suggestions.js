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

var selected = [];

function tableHighlightRow() {
    if (document.getElementById && document.createTextNode) {
        var tables=document.getElementsByTagName('table');
        for ( var i=0; i<tables.length; i++ ) {
            if ( tables[i].className==='TableListJS' ) {
                var trs=tables[i].getElementsByTagName('tr');
                for ( var j=0; j<trs.length; j++) {
                    if (trs[j].parentNode.nodeName==='TBODY') {
                        trs[j].onmouseover=function(){
                            // 'highlight' color is set in tablelist.css
                            if ( this.className === '') {
                                this.className='highlight';
                            }
                            return false
                        }
                        trs[j].onmouseout=function(){
                            if ( this.className === 'highlight') {
                                this.className='';
                            }
                            return false
                        }
                        trs[j].onmousedown=function(){
                            //
                            // Toggle the selected state of this row
                            //

                            // 'clicked' color is set in tablelist.css.
                            if ( this.className !== 'clicked' ) {
                                // Mark this row as selected
                                this.className='clicked';
                                selected.push(this.firstElementChild.firstElementChild.href);
                                localStorage.setItem('selected', JSON.stringify(selected));
                            }
                            else {
                                this.className='';
                                selected.splice(selected.indexOf(this.firstElementChild.firstElementChild.href), 1);
                                localStorage.setItem('selected', JSON.stringify(selected));
                            }

                            return true
                        }

                        if (trs[j].firstElementChild && trs[j].firstElementChild.firstElementChild &&
                            selected.indexOf(trs[j].firstElementChild.firstElementChild.href) > -1) {
                            trs[j].className = 'clicked';
                        }
                    }
                }
            }
        }
    }
}

var port = null;
var repo = null;
var type = null;
var id = null;
var GitHub_RE = /https?:\/\/github\.com\/(.*)\/(pulls?|issues?)\/([0-9]+)/;
var localStorage = window.localStorage;

function displayMessage(text) {
    document.getElementById('response').innerHTML = text;
}

function displayErrorMessage(text) {
    document.getElementById('error_response').innerHTML = text;
    document.getElementById('LinksRecordedConfirmation').showModal()
}

function updateUiState() {
    document.getElementById('threshold-slide-container').style.display = 'none';
    if (port) {
        document.getElementById('connect-button').style.display = 'none';
        document.getElementById('record-selected-button').style.display = 'none';
    } else {
        document.getElementById('connect-button').style.display = 'block';
        document.getElementById('record-selected-button').style.display = 'none';
    }
}

function sendPredictionRequest() {
            localStorage.removeItem('last_msg');
            localStorage.setItem('repo', repo);
            localStorage.setItem('type', type);
            localStorage.setItem('id', id);

            var message = null;
            if (type.match(/pulls?/)) {
                message = {"Type": "Prediction", "Repository": repo, "PR": id, 'Issue': null};
            } else {
                message = {"Type": "Prediction", "Repository": repo, "PR": null, 'Issue': id};
            }
            port.postMessage(message);
}

function sendModelUpdateRequest() {
    var message = {"Type": "Update"};
    port.postMessage(message);
    document.getElementById('modelUpdateWarningDialog').close();
    closeNav();
}

function getMaxThreshold(previous_repo) {
    var previous_max = localStorage.getItem('maxTh');
    if (previous_repo === repo && previous_max){
        document.getElementById('Threshold').max = previous_max;
        if (!(document.getElementById('Threshold').value)) {
            document.getElementById('Threshold').value = Math.ceil(previous_max / 2)
        }
    } else {
        var message = {"Type": "Threshold", "Repository": repo};
        port.postMessage(message);
    }
}

function sendRecordSelectedLinks() {
    links = [];
    for (var i = 0; i < selected.length; i++){
        other_id = selected[i].split('/');
        other_id = other_id[other_id.length - 1];
        if (other_id !== null && id !== null) {
            if (type.match(/pulls?/)) {
                links.push([other_id, id])
            } else {
                links.push([id, other_id])
            }
        }
    }
    var message = {"Type": "LinkUpdate", "Repository": repo, "Links": JSON.stringify(links)};
    console.debug(message);
    port.postMessage(message);
    closeNav();
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

function displayResults(suggestions, threshold) {
    var html = '<table class="TableListJS" id="entries">';
    html = html + '<thead><tr><td width="350px">Title</td></tr></thead><tbody>';
    displayable = suggestions.filter(s => s.Probability >= threshold);
    if (displayable.length === 0) {
        document.getElementById('record-selected-button').style.display = 'none';
        html = html + '<tr>';
        html = html + '<td width="350px">No suggestions available above the current threshold</td>';
        html = html + '</tr>';
    } else {
        document.getElementById('record-selected-button').style.display = 'block';
        for (var i = 0; i < displayable.length; i++) {
            html = html + '<tr>';
            var suggestion = displayable[i];
            html = html + '<td width="350px"><a href="https://www.github.com/' + suggestion.Repo + '/issues/'
                + suggestion.Id + '" target="_blank">'
                + suggestion.Title + '</a></td>';//'<td width="30px">' + suggestion.Probability + '</td>';
            html = html + '</tr>';
        }
    }
    html = html + '</tbody>';
    displayMessage(html);
    tableHighlightRow();
}


function onNativeMessage(message) {
    if (message.hasOwnProperty('Threshold')) {
        var max = Math.min(Math.ceil(message.Threshold * 100 * 2), 100);
        localStorage.setItem('maxTh', max.toString());
        document.getElementById('Threshold').max = max;
        document.getElementById('Threshold').value = Math.ceil(message.Threshold * 100)
    } else {
        if (message.Suggestions.length > 0) {
            localStorage.setItem('last_msg', JSON.stringify(message));
            selected = [];
            localStorage.setItem('selected', JSON.stringify(selected));
            document.getElementById('record-selected-button').style.display = 'block';
            document.getElementById('threshold-slide-container').style.display = 'block';
            th = localStorage.getItem('threshold');
            if (th !== null) {
                document.getElementById('Threshold').value = th;
            } else {
                th = document.getElementById('Threshold').value;
            }
            displayResults(message.Suggestions, th / 100)
        } else {
            // document.getElementById('record-selected-button').style.display = 'none';
            // document.getElementById('threshold-slide-container').style.display = 'none';
            displayErrorMessage(message.Error)
        }
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

/* Set the width of the side navigation to 250px and the left margin of the page content to 250px */
function openNav() {
    document.getElementById("mySidenav").style.width = "350px";
    document.getElementById("main").style.marginLeft = "350px";
}

/* Set the width of the side navigation to 0 and the left margin of the page content to 0 */
function closeNav() {
    document.getElementById("mySidenav").style.width = "0";
    document.getElementById("main").style.marginLeft = "0";
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('connect-button').addEventListener('click', connect);
    document.getElementById('record-selected-button').addEventListener('click', sendRecordSelectedLinks);
    document.getElementById('openbtn').addEventListener('click', openNav);
    document.getElementById('closebtn').href = "#";
    document.getElementById('closebtn').addEventListener('click', closeNav);
    document.getElementById('update-model-button').addEventListener('click', sendModelUpdateRequest);
    document.getElementById('update-confirm').addEventListener('click',
        function () {document.getElementById('modelUpdateWarningDialog').showModal()});
    document.getElementById('update-model-dismiss').addEventListener('click',
        function () {document.getElementById('modelUpdateWarningDialog').close()});
    document.getElementById('links-recorded-button').addEventListener('click',
        function () {document.getElementById('LinksRecordedConfirmation').close()});
    document.getElementById('Threshold').oninput = function () {
        last_msg = JSON.parse(localStorage.getItem('last_msg'));
        localStorage.setItem('threshold', this.value);
        displayResults(last_msg.Suggestions, this.value/100);
    };
    connect();
    displayMessage('<div class="loader"></div>');
    getCurrentTabUrl(function(url) {
        if (url.match(/^https?:\/\/github\.com\/.*\/(pulls?|issues?)\/.*$/)) {
            var msg_str = localStorage.getItem('last_msg');
            var message = null;
            if (msg_str != null) {message = JSON.parse(msg_str);}
            var previous_repo = localStorage.getItem('repo');
            var previous_type = localStorage.getItem('type');
            var previous_id = localStorage.getItem('id');
            var repo_issue = url.replace(GitHub_RE, '$1 $2 $3').split(' ');
            repo = repo_issue[0];
            type = repo_issue[1];
            id = repo_issue[2];
            console.debug(message);
            getMaxThreshold(previous_repo);
            console.debug(message);
            if (repo === previous_repo && previous_type === type && previous_id === id) {
                if (message == null) {return}
                else {
                        if ((message.Suggestions.length === 0) && (message.Error.includes('No suggestions available'))) {
                            displayErrorMessage(message.Error);
                            return;
                        } else {if ((message.Suggestions.length === 0) && !message.Error.includes('No suggestions available')) {
                            sendPredictionRequest();
                            return;
                        }}
                }
                selected = JSON.parse(localStorage.getItem('selected'));
                if (selected === null) {selected = []}
                document.getElementById('record-selected-button').style.display = 'block';
                document.getElementById('threshold-slide-container').style.display = 'block';
                th = localStorage.getItem('threshold');
                if (th !== null) {document.getElementById('Threshold').value = th;} else {
                    th = document.getElementById('Threshold').value;
                }
                displayResults(message.Suggestions, th / 100);
            } else {
                sendPredictionRequest();
            }
        } else {
            displayMessage('This mode only works on GitHub PR and Issue pages, please navigate to one to use it.')
        }
    })
});