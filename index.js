const fs = require("fs");
const OpenAI = require("openai");
const express = require("express");
const cors = require("cors");
const { STATUS_CODES } = require("http");
const app = express();
app.use(cors());
app.use(express.json())
const showdown = require('showdown');
const converter = new showdown.Converter();

require("dotenv").config();
let devicedata = JSON.parse(fs.readFileSync("devices.json", "utf8", (err, data) => {
    if (err) {
        console.log("ERROR LOADING DEVICEDATA INITIALLY");
    }
}));

app.listen(3069, () => {
  console.log("Server running on port 3069");
});



const client = new OpenAI({
  apiKey: process.env['API_KEY'], 
});

async function callGPT(inputPrompt) {
    let suggestion = "";
  const chatCompletion = await client.chat.completions.create({
    messages: [{ role: 'system', content: "You will be given a JSON with info about a city infrastructure. You are to assess said info (efficiency, status etc), and give a rating out of 10. If any errors/anomalies are detected, add a 'suggestion' bit saying what can be improved. Limit responses to 60 words. Systems generating/using power above 60% is ok, and above 90% give a warning against overuse. Format stuff properly: eg make Rating: bold" }
        ,{ role: 'user', content: `${inputPrompt}` }],
    model: 'gpt-4o-mini',
  }).then((response) => {
    suggestion = response.choices[0].message.content;
    console.log(suggestion);
  }).catch((error) => {
    console.log(error);
  });
  return converter.makeHtml(suggestion);
}
console.log(devicedata[0])

app.get("/devices", (req, res) => {
    devicedata = JSON.parse(fs.readFileSync("devices.json", "utf8", (err, data) => {
        if (err) {
            console.log(err);
        } else {
            res.send(data);
        }
    }));
    res.status(200).send(devicedata);
});


app.post("/suggestions", async (req, res) => {
    console.log(req.body.id)
    const device = devicedata.find(device => device.id === req.body.id);
    if (device) {
        res.status(200).send({message: await callGPT(JSON.stringify(device))});
    } else {
        res.status(404).send({ error: "Device not found" });
    }

});