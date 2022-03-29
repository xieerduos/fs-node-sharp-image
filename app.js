const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const QueueManager = require("./QueueManager");

const mime = require("mime");

// 兼容mac文件格式
mime.define({ "image/jpeg": ["jfif"] });

// 获取文件信息
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
// 读取文件操作
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

// 模拟发送请求 上传文件块
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
    try {
        // 实例一个 队列管理对象
        const queueInstance = new QueueManager(1);
        // 获取文件信息
        const statData = await getStatByFile(filename);

        // const fileType = mime.getType(filename);

        // 每次读取 64 * 1024 KB
        const highWaterMark = 64 * 1024;

        // 读取文件的次数
        const readTotalCount = Math.ceil(statData.size / highWaterMark);

        // 合并文件buffer数组
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
        // sharp库 生成图片
        await sharp(Buffer.concat(inputBuffer)).toFile(
            `output${Date.now()}${path.extname(filename)}`
        );
    } catch (error) {
        console.error("error :>> ", error);
    }
}
const filename = path.join("./", "input.png");

main(filename);
