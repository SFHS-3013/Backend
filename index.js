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
const utils = require("./utils")

require("dotenv").config();
let devicedata = JSON.parse(fs.readFileSync("devices.json", "utf8", (err, data) => {
    if (err) {
        console.log("ERROR LOADING DEVICEDATA INITIALLY");
    }
}));

app.listen(3069, () => {
  console.log("Server running on port 3069");
});


let auditLog = JSON.parse(fs.readFileSync("audit-log.json", "utf8", (err, data) => {
  if (err) {
      console.log("ERROR LOADING AUDIT-LOG INITIALLY");
  }
}));

const client = new OpenAI({
  apiKey: process.env['API_KEY'], 
});

async function callGPT(inputPrompt) {
    let suggestion = "";
  const chatCompletion = await client.chat.completions.create({
    messages: [{ role: 'system', 
      content: `You will be given a JSON object with info about a component of Urban Infrastructure. You are to assess said info (efficiency, status etc), and give a rating out of 10.

If any errors/anomalies are detected, add a 'suggestion' bit saying what can be improved. Systems generating/using power above 40% is ok, and above 100% give a warning against overuse.
Format stuff properly: eg make 'Rating:' bold.
Limit responses to 60 words. ` }
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

function randomiseDeviceParameters() {
  for (let i=0; i<devicedata.length; i++)
    {
      let device = devicedata[i];
      if (device.type == "solar") {
        device.power_production = Math.floor(((Math.random() * 0.7) + 0.25 )* device.power_rating);
        device.efficiency = parseFloat((device.power_production/device.power_rating).toFixed(2));
        if(device.efficiency < 0.4)
        {
          device.status = "low_power";
        }
        console.log(device)
      }
      else if (device.type == "battery")
      {
        device.charge_level = device.charge_level - Math.floor(Math.random() * 10)/10;
        if(device.charge_level < 0.3)
        {
          device.status = "low_charge";
        }
        console.log(device)
      }
    }
    console.log("randomised!")
}

function updateDeviceParamsFile() {
  fs.writeFile("devices.json", JSON.stringify(devicedata), (err) => {
    if (err) {
      console.log("ERROR WRITING TO DEVICEDATA");
    }
  });
}

function addToAuditLog(action){
  auditLog.push(action);
  fs.writeFileSync("audit-log.json", JSON.stringify(auditLog), (err) => {
    if (err) {
      console.log("Error updating AuditLog file");
    }
  });
}



app.get("/devices", (req, res) => {
    randomiseDeviceParameters();
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

app.post("/newdevice", (req, res) => {
    if (req.body.auth==process.env.PASSWORD)
    {
      const newDevice = req.body.device;
      devicedata.push(newDevice);
      updateDeviceParamsFile();
      res.status(201).send({ message: "Device added", device: newDevice });
      addToAuditLog({
        user: req.body.user,
        action: "Add new device",
        details: `New Device added: ${newDevice.id}`, 
        time: utils.prettyTime()
      })
    }
    else 
    {
      res.status(401).send({error: "Incorrect password"})
      addToAuditLog({
        user: req.body.user,
        action: "FAIL - Add new device",
        details: "Incorrect password", 
        time: utils.prettyTime()
      })
    }
});


app.post("/setdevicestatus", (req, res) => {
  if (req.body.auth==process.env.PASSWORD)
  {
    const device = devicedata.find(device => device.id == req.body.deviceID);
    if (device) {
      device.status = req.body.status;
      updateDeviceParamsFile();
      res.status(200).send({ message: "Device status updated", device: device });
      addToAuditLog({
        user: req.body.user,
        action: `Updated device status to ${req.body.status}`,
        details: `Device ${device.id} status updated to ${devic.status}`, 
        time: utils.prettyTime()
      })
    } else {
      res.status(404).send({ error: "Device not found" });
      addToAuditLog({
        user: req.body.user,
        action: "FAIL - Updated device status",
        details: `Device ${req.body.id} not found`, 
        time: utils.prettyTime()
      });
    }
  }
});