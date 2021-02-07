const qs = require('querystring');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const http = require('http');
const fs = require('fs/promises');
const crypto = require('crypto');
const serviceAccount = require('./serviceAccountKey.json');
const config = require('./config.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: config.firebase.storageBucket
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
                    home: storageFile.publicUrl(),
                    note: storageFile.publicUrl().replace('home-', 'note-')
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
        await page.goto(config.misskey.url);

        await page.evaluate((username, id, token) => {
            localStorage.setItem('accounts', JSON.stringify([{id, token}]));
            localStorage.setItem('account', JSON.stringify({id, username, token}));
        }, config.misskey.username, config.misskey.id, config.misskey.token);

        await page.goto(`${config.misskey.url}/settings/theme/install`);

        await page.waitForSelector(themeSelector, {timeout: 10000});
        await page.type(themeSelector, themeData);

        await page.click('body > div > div.contents.withHeader > main > div.content > div > div > div > div.vrtktovg._formItem > div.main._form_group > div.yzpgjkxe._formItem > button');

        await page.click('body > div > div.mvcprjjd.sidebar > nav > div > a.item.index');

        await page.waitForSelector(noteSelector, {timeout: 10000});

        await page.waitForTimeout(400);


        try {
            await page.screenshot({path: homeFileName});

            const clip = await page.evaluate(s => {
                const el = document.querySelector(s);

                const {width, height, top: y, left: x} = el.getBoundingClientRect();
                return {width, height, x, y};
            }, noteSelector);

            await page.screenshot({clip, path: noteFileName});

            await browser.close();

            try {
                const homePromise = bucket.upload(homeFileName, {destination: `theme-screenshot/${homeFileName}`});
                const notePromise = bucket.upload(noteFileName, {destination: `theme-screenshot/${noteFileName}`});
                const [[home], [note]] = await Promise.all([homePromise, notePromise]);
                await Promise.all([home.makePublic(), note.makePublic()]);

                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(
                    JSON.stringify({
                        home: home.publicUrl(),
                        note: note.publicUrl()
                    })
                );
                return;
            } catch (err) {
                console.log(err);
            }
        } finally {
            await Promise.all([fs.unlink(homeFileName), fs.unlink(noteFileName)]);
        }

        res.writeHead(500);
        res.end();
    });


}).listen(config.listenPort);
