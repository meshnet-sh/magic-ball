const fs = require('fs');

const filePaths = [
    'C:/Projects/Magic-Ball/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/6cc1d7b9f9966f866dad27c8cac2061d1d4d5754d6a1caa64ae296d286600626.sqlite',
    'C:/Projects/Magic-Ball/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite'
];

filePaths.forEach(file => {
    try {
        if (!fs.existsSync(file)) return;
        const content = fs.readFileSync(file, 'binary');

        // Match the UUID format specifically located near meshnet@163.com
        // Sometimes SQLite splits strings, but let's try a simple regex over the binary string
        const regex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}).{0,80}meshnet@163\.com/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            console.log("FOUND_USER_ID:", match[1]);
        }
    } catch (e) {
        console.error(e.message);
    }
});
