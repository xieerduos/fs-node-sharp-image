const fs = require("fs");
const path = require("path");
const QueueManager = require("./QueueManager");
const sharp = require("sharp");
function getStatByFile(filename) {
    return new Promise((resolve, reject) => {
        fs.stat(filename, (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(stats);
        });
    });
}

async function readFileHandler(filename, options = {}, callback) {
    const statData = options.statData;
    const highWaterMark = options.highWaterMark;
    const encoding = options.encoding;
    let readCurrentCount = options.readCurrentCount || 0;

    // 创建一个读取流
    const readStream = fs.createReadStream(filename, {
        start: readCurrentCount * highWaterMark,
        end: (readCurrentCount + 1) * highWaterMark,
        highWaterMark,
        encoding,
    });

    // 默认每次读取 64 * 1024 KB
    // 获取读取的次数
    const readTotalCount = Math.ceil(statData.size / highWaterMark);

    readStream.on("data", (data) => {
        readCurrentCount++;
        callback({
            type: "data",
            data: data,
            readTotalCount,
            readCurrentCount,
            statData,
        });
    });
    readStream.on("end", (data) => {
        callback({
            type: "end",
            data: data,
            readTotalCount,
            readCurrentCount,
            statData,
        });
    });

    readStream.on("error", (err) => {
        callback({
            type: "error",
            err,
            readTotalCount,
            readCurrentCount,
            statData,
        });
    });
}

function netHandler({ readCurrentCount, statData, highWaterMark }) {
    return new Promise(async (resolve, reject) => {
        try {
            await readFileHandler(
                filename,
                {
                    readCurrentCount,
                    statData,
                    highWaterMark,
                    // encoding: "base64",
                },
                ({ type, error, ...reset }) => {
                    if (type === "error") {
                        reject(new Error(error));
                    }
                    if (reset.data) {
                        data = reset.data;
                    }

                    if (type === "data") {
                        resolve(reset);
                    }
                }
            );
        } catch (error) {
            reject(error);
        }
    });
}

async function main(filename) {
    const queueInstance = new QueueManager(1);
    const statData = await getStatByFile(filename);

    const highWaterMark = 64 * 1024;

    const readTotalCount = Math.ceil(statData.size / highWaterMark);

    let inputBuffer = [];

    for (let index = 0; index < readTotalCount; index++) {
        try {
            const result = await queueInstance.push({
                fetch: netHandler.bind(this, {
                    readCurrentCount: index,
                    statData,
                    highWaterMark,
                }),
            });

            console.log(
                "progress ",
                result.readCurrentCount / result.readTotalCount
            );
            inputBuffer.push(result.data);
        } catch (error) {
            console.log("error :>> ", error);
            break;
        } finally {
        }
    }
    await sharp(Buffer.concat(inputBuffer)).toFile("output.png");
}
const filename = path.join("./", "input.png");

main(filename);
