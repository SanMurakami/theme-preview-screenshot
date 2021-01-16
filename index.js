const qs = require('querystring');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const http = require('http');
const fs = require('fs/promises');
const crypto = require('crypto');
const serviceAccount = require('./serviceAccountKey.json');


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'misskeyassetstore.appspot.com'
});
const bucket = admin.storage().bucket();

http.createServer((req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(400);
        res.end();
        return;
    }

    const themeSelector = 'body > div > div.contents.withHeader > main > div.content > div > div > div > div.vrtktovg._formItem > div.main._form_group > div.rivhosbp._formItem > div.input._formPanel > textarea';
    const noteSelector = 'body > div > div.contents.withHeader > main > div.content > div > div > div._list_._content._vMargin > div.sqadhkmv._list_ > div:nth-child(1)';

    let data = '';

    req.on('data', chunk => {
        data += chunk;
    });

    req.on('end', async () => {
        const themeData = qs.parse(data).theme;
        const themeHash = crypto.createHash('sha256').update(themeData).digest('hex');
        const homeFileName = `home-${themeHash}.png`;
        const noteFileName = `note-${themeHash}.png`;

        const storageFile = bucket.file(`theme-screenshot/${homeFileName}`);
        if ((await storageFile.exists())[0]) {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(
                JSON.stringify({
                    home: `https://firebasestorage.googleapis.com/v0/b/misskeyassetstore.appspot.com/o/theme-screenshot%2F${homeFileName}?alt=media`,
                    note: `https://firebasestorage.googleapis.com/v0/b/misskeyassetstore.appspot.com/o/theme-screenshot%2F${noteFileName}?alt=media`
                })
            );
            return;
        }


        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ]
        });


        const page = await browser.newPage();
        await page.setViewport({width: 1920, height: 1080});
        await page.goto('https://theme-preview.misskey.io/');

        await page.evaluate(() => {
            localStorage.setItem('accounts', '[{"id":"8h1n7osy4z","token":"82LPJVdX1ICOipKy"}]');
            localStorage.setItem('account', '{"id":"8h1n7osy4z","name":null,"username":"preview","host":null,"avatarUrl":"http://theme-preview.misskey.io/avatar/8h1n7osy4z","avatarBlurhash":null,"avatarColor":null,"isAdmin":true,"isModerator":false,"isBot":false,"isCat":false,"emojis":[],"url":null,"createdAt":"2021-01-15T09:27:48.562Z","updatedAt":"2021-01-15T09:32:21.065Z","bannerUrl":null,"bannerBlurhash":null,"bannerColor":null,"isLocked":false,"isSilenced":false,"isSuspended":false,"description":null,"location":null,"birthday":null,"fields":[],"followersCount":0,"followingCount":0,"notesCount":4,"pinnedNoteIds":[],"pinnedNotes":[],"pinnedPageId":null,"pinnedPage":null,"twoFactorEnabled":false,"usePasswordLessLogin":false,"securityKeys":false,"avatarId":null,"bannerId":null,"injectFeaturedNote":true,"alwaysMarkNsfw":false,"carefulBot":false,"autoAcceptFollowed":true,"noCrawle":false,"isExplorable":true,"hasUnreadSpecifiedNotes":false,"hasUnreadMentions":false,"hasUnreadAnnouncement":false,"hasUnreadAntenna":false,"hasUnreadChannel":false,"hasUnreadMessagingMessage":false,"hasUnreadNotification":false,"hasPendingReceivedFollowRequest":false,"integrations":{},"mutedWords":[],"mutingNotificationTypes":[],"email":null,"emailVerified":false,"securityKeysList":[],"token":"82LPJVdX1ICOipKy"}')
        });

        await page.goto('https://theme-preview.misskey.io/settings/theme/install');

        await page.waitForSelector(themeSelector, {timeout: 10000});
        await page.type(themeSelector, themeData);

        await page.click('body > div > div.contents.withHeader > main > div.content > div > div > div > div.vrtktovg._formItem > div.main._form_group > div.yzpgjkxe._formItem > button');

        await page.click('body > div > div.mvcprjjd.sidebar > nav > div > a.item.index');

        await page.waitForSelector(noteSelector, {timeout: 10000})

        await page.waitForTimeout(400);


        try {

            await page.screenshot({path: homeFileName});

            const clip = await page.evaluate(s => {
                const el = document.querySelector(s)

                const {width, height, top: y, left: x} = el.getBoundingClientRect()
                return {width, height, x, y}
            }, noteSelector)

            await page.screenshot({clip, path: noteFileName});

            await browser.close();

            try {
                await bucket.upload(homeFileName, {destination: `theme-screenshot/${homeFileName}`});
                await bucket.upload(noteFileName, {destination: `theme-screenshot/${noteFileName}`});
            } catch (err) {
                console.log(err);
            }
        } finally {
            await fs.unlink(homeFileName);
            await fs.unlink(noteFileName);
        }

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(
            JSON.stringify({
                home: `https://firebasestorage.googleapis.com/v0/b/misskeyassetstore.appspot.com/o/theme-screenshot%2F${homeFileName}?alt=media`,
                note: `https://firebasestorage.googleapis.com/v0/b/misskeyassetstore.appspot.com/o/theme-screenshot%2F${noteFileName}?alt=media`
            })
        );
    });


}).listen(3000);
