var element = encodeURI(document.body.outerHTML);
chrome.runtime.sendMessage({
    action: "getSource",
    source: element
});
console.debug(decodeURI(element));