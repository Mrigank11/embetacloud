# eMbeta Cloud
New concept to directly upload files from server to Google Drive.
It will give you a proxy and will automatically download files to server, after which you can easily upload it Google Drive or download it
to your PC.

Somebody is requested to upload it to a high-speed server so that it's made open to all.

# Features
- Single Page UI (made with semantic-ui and angularJS)
- Responsive UI
- Realtime information update
- Support for **torrents**
- Can upload complete folders to Google Drive with click of a button
- Zip and download torrents
- Zip and upload torrents to Drive

# Usage
First clone the repo and install dependencies:
```js
npm install
```
You have to make a google developers project and set the following environment variables:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URL (it should be &lt;server address&gt;/oauthCallback by default)

Ensure that you request full google drive access permission and basic G+ info in your google project 

To start server, run:
```js
npm start
```
<h2>For Heroku:</h2>
You still need a Google Dev. Project.

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

# Debugging
eMbeta Cloud is [debug](https://github.com/visionmedia/debug) compatible, to get debug info set environment variable `DEBUG=eMCloud:*`
and start server.

# Upcoming Features
- Incognito mode

# How to contribute
- Find bugs and report them
- Suggest new features
- Fix bugs