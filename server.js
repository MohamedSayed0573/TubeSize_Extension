const express = require("express");
const app = express();
const { exec, execFile } = require("node:child_process");
const { filesize } = require("filesize");
const ms = require("ms");

app.get("/test", (req, res) => {
    res.json({ message: "Hello from the API!" });
});

app.get("/api/video-sizes/:videoTag", (req, res) => {
    const startTime = Date.now();
    const videoTag = req.params.videoTag;

    execFile(
        "yt-dlp",
        ["-J", "--no-warnings", videoTag],
        (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing yt-dlp: ${error.message}`);
                return res
                    .status(500)
                    .json({ error: "Failed to retrieve video formats" });
            }
            const data = JSON.parse(stdout);

            const endTime = Date.now();

            const videoFormats = ["394", "395", "396", "397", "398", "399"];
            const audioFormat = "251";
            
            const parsedData = {
                id: data.id,
                title: data.title,
                duration: ms(data.formats[0].fragments[0].duration * 1000),
                audioFormat: filesize(
                    data.formats.filter(
                        (format) => format.format_id === audioFormat,
                    )[0].filesize_approx,
                ),
                videoFormats: data.formats
                    .filter(
                        (format) =>
                            format.height &&
                            format.filesize &&
                            videoFormats.includes(format.format_id),
                    )
                    .map((format) => {
                        return {
                            format_id: format.format_id,
                            height: format.height,
                            filesize: filesize(format.filesize),
                        };
                    }),
                executionTime: ms(endTime - startTime),
            };

            res.json(parsedData);
        },
    );
});

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});

