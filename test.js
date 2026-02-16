const Redis = require("redis");
const redisClient = Redis.createClient();

async function run() {
    await redisClient.connect();
    
    console.log("REDIS CONNECTED");
    
    await redisClient.quit();
    
    console.log("REDIS DISCONNECTED 1");
    
    await redisClient.quit();
    
    console.log("REDIS DISCONNECTED 2");
    
}

run();
