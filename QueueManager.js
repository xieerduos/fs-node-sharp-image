const { v4: uuidv4 } = require("uuid");
module.exports = function QueueManager(number) {
    if (!(typeof number === "number" && !Number.isNaN(number))) {
        console.error(
            `QueueManager params typeof number === '${typeof number}', value: ${number}`
        );
    }

    this.number = number;

    this.data = {};

    this.handler = (current) => {
        const hits = current.queues.filter((i) => i.isFetch === false);
        hits.forEach((item) => {
            item.isFetch = true;

            item.task()
                .then(item.resolve)
                .catch(item.reject)
                .finally(() => {
                    const deleteIndex = current.queues.findIndex(
                        (del) => del.key === item.key
                    );

                    if (deleteIndex !== -1) {
                        current.queues.splice(deleteIndex, 1);
                    }

                    if (current.caches.length > 0) {
                        current.queues.push(current.caches.shift());
                        this.trigger();
                    }

                    Object.keys(this.data).forEach((item) => {
                        if (
                            this.data[item].queues.length === 0 &&
                            this.data[item].caches.length === 0
                        ) {
                            delete this.data[item];
                        }
                    });
                });
        });
    };

    this.trigger = () => {
        Object.keys(this.data).forEach((item) => {
            this.handler(this.data[item]);
        });
    };

    this.push = ({
        uuid = "abcdef",
        fetch = () => new Promise((resolve) => resolve()),
    }) => {
        return new Promise((resolve, reject) => {
            // 绑定一个函数并传参
            // const task = window.fetch.bind(null, ...reset);

            // 生成一个key值，用于删除队列任务
            const key = uuidv4();
            // const key = Math.random();

            const newItem = {
                key,
                isFetch: false,
                task: fetch,
                resolve,
                reject,
            };

            // 限制相同uuid并发数量
            if (
                this.data[uuid] &&
                Array.isArray(this.data[uuid].queues) &&
                this.data[uuid].queues.length >= this.number
            ) {
                this.data[uuid].caches.push(newItem);
            } else {
                if (this.data[uuid] && Array.isArray(this.data[uuid].queues)) {
                    this.data[uuid].queues.push(newItem);
                } else {
                    this.data[uuid] = {
                        queues: [newItem],
                        caches: [],
                    };
                }
                this.trigger();
            }
        });
    };
};
