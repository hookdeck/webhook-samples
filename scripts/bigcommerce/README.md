# Big Commerce Example Generation for console.hookdeck.com

Script to read the contents of Big Commerce events reference pages and generate examples for [Hookdeck Console](https://console.hookdeck.com).

## Usage

Start the receiver in the top level of the repo:

```sh
yarn dev:receiver
```

Run the script to parse the Big Commerce reference pages and make `POST` requests to the receiver to capture the events.

```sh
yarn start
```
