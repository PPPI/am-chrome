# am-chrome
A chrome plugin using [A-m](https://github.com/PPPI/a-m) as a backend to offer suggestions at PR submission time regarding related issues.

You can download any release from this repository and load it via Chrome's chrome://extensions page, but you should remember to get the backend as well from [here](https://github.com/PPPI/a-m). The relevant chrome entry point is [here](https://github.com/PPPI/a-m/tree/master/chrome_entry).

If you are unsure how to load an unpacked extension, you can see how [here](https://developer.chrome.com/extensions/getstarted#unpacked).

You should then edit the file "./chrome_entry/linker(-win).json". For ilustartaion, the windows file looks as follows and only the `"path"` differs from the linux one:
```json
{
  "name": "linker",
  "description": "Linker headless server to be used with the Chrome extension",
  "path": "__main__.bat",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<your extension id here>/"
  ]
}
```
and replace `<your extension id here>` with the ID that the extension was assigned by chrome after instalation.

Finally, so that chrome knows what code to call for native calls, you should run `install[.bat/.sh]` from the same folder (chrome_entry). The uninstall scripts are provided in the same folder if needed.
