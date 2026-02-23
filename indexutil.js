import { createCanvas, Image, loadImage } from "canvas";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

main();

function resize(image, resizeWidth, resizeHeight) {
    const canvas = createCanvas(resizeWidth, resizeHeight);
    const aspect = image.width / image.height;
    const aspectDifference = (resizeWidth / resizeHeight) / aspect;

    const afterWidth = resizeWidth / Math.min(aspectDifference, 1);
    const afterHeight = resizeHeight * Math.max(aspectDifference, 1);

    const ctx = canvas.getContext("2d");
    ctx.drawImage(
        image,
        (afterWidth - resizeWidth) * -0.5,
        (afterHeight - resizeHeight) * -0.5,
        afterWidth, afterHeight
    );

    return canvas;
}

async function main() {
    const inputDir = path.resolve("source");
    const previewDir = path.resolve("preview");
    const fileDir = path.resolve("file");
    const sourceImages = fs.readdirSync(inputDir);

    const fileList = fs.existsSync("images.json") ? JSON.parse(fs.readFileSync("images.json")) : {
        files: []
    };
    const doneFiles = new Set(fileList.files.map(o => o.hash));


    const resizeWidth = 640;
    const resizeHeight = 360;

    for await(const sourceFileName of sourceImages) {
        console.log("## Processing " + sourceFileName + " ##");
        const inputPath = path.join(inputDir, sourceFileName);

        
        console.log("Loading image");
        const image = await loadImage(inputPath);
        const sourceCanvas = createCanvas(image.width, image.height);
        const sourceCtx = sourceCanvas.getContext("2d");
        sourceCtx.drawImage(image, 0, 0);

        const stats = fs.statSync(inputPath);
        const creationDate = new Date(stats.mtime).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

        console.log("Generating hash");
        const imageHash = crypto.createHash("sha1")
            .update(sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data)
            .digest()
            .toString("hex");
        console.log("Hash: " + imageHash);
            
        const fileDescriptor = fileList.files.find(o => o.hash == imageHash) ?? {};
        fileDescriptor.preview ??= "gallery/preview/" + imageHash + ".jpg";
        fileDescriptor.file ??= "gallery/file/" + imageHash + ".png";
        fileDescriptor.hash ??= imageHash;
        fileDescriptor.description ??= [];
        fileDescriptor.creationDate ??= creationDate;
        fileDescriptor.width ??= image.width;
        fileDescriptor.height ??= image.height;

        if(!doneFiles.has(imageHash)) {
            const previewOutput = path.join(previewDir, imageHash + ".jpg");
            const fileOutput = path.join(fileDir, imageHash + ".png");

            console.log("Creating preview image");
            const preview = resize(image, resizeWidth, resizeHeight);

            console.log("Creating loading image");
            const loading = resize(image, resizeWidth * 0.3, resizeHeight * 0.3);

            fileDescriptor.loading = await new Promise((res, rej) => {
                const stream = loading.createJPEGStream({ quality: 0.5 });
                let data = Buffer.alloc(0);
                stream.on("data", (chunk) => {
                    data = Buffer.concat([data, chunk])
                })
                stream.once("close", () => res("data:image/jpg;base64," + data.toString("base64")));
                stream.once("error", rej);
            });

            console.log("Writing " + previewOutput);
            await new Promise((res, rej) => {
                const stream = fs.createWriteStream(previewOutput);
                preview.createJPEGStream({ quality: 0.9 }).pipe(stream);
                stream.once("close", res);
                stream.once("error", rej);
            });
            console.log("Writing " + fileOutput);
            await new Promise((res, rej) => {
                const stream = fs.createWriteStream(fileOutput);
                sourceCanvas.createPNGStream().pipe(stream);
                stream.once("close", res);
                stream.once("error", rej);
            });

            fileList.files.push(fileDescriptor);
        }
        
        fs.writeFileSync("images.json", JSON.stringify(fileList, null, 4));
    }
}