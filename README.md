# eMbeta Cloud
New concept to directly upload files from server to Google Drive.
It will give you a proxy and will automatically download files to server, after which you can easily upload it Google Drive or download it
to your PC.

Somebody is requested to upload it to a high-speed server so that it's made open to all.

# Usage
First clone the repo and install dependencies:
```js
npm install
```
To start server, run:
```js
npm start
```
# Debugging
eMbeta Cloud is [debug](https://github.com/visionmedia/debug) compatible, to get debug info set environment variable `DEBUG=eMCloud:*`
and start server.

# Todo
- use CLOUD emits for progress while uploading file to GDrive