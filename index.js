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
const { Database } = require("quickmongo");


require("dotenv").config();
const db = new Database(process.env.MONGO);
let auditLog;
db.on("ready", async () => {
  console.log("Database connected!");
  auditLog = await db.get("auditlog")

});
let devicedata = db.get("devicedata");

app.listen(3069, () => {
  console.log("Server running on port 3069");
});

const client = new OpenAI({
  apiKey: process.env['API_KEY'], 
});

async function callGPT(inputPrompt) {
    let suggestion = "";
  const chatCompletion = await client.chat.completions.create({
    messages: [{ role: 'system', 
      content: `You will be given a JSON object with info about a component of Urban Infrastructure. You are to assess said info (efficiency, status etc), and give a rating out of 10.

If any errors/anomalies are detected, add a 'AI suggestion' bit saying what can be improved. Systems generating/using power above 40% is ok.
Format stuff properly: eg make 'Rating:' bold.
Limit responses to 60 words. ` }
        ,{ role: 'user', content: `${inputPrompt}` }],
    model: 'gpt-4o-mini',
  }).then((response) => {
    suggestion = response.choices[0].message.content;
    //console.log(suggestion);
  }).catch((error) => {
    console.log(error);
  });
  return converter.makeHtml(suggestion);
}

function randomiseDeviceParameters() {
  for (let i=0; i<devicedata.length; i++)
    {
      let device = devicedata[i];
      if (device.type == "solar") {
        device.power_production = Math.floor(((Math.random() * 0.6) + 0.37 )* device.power_rating);
        device.efficiency = parseFloat((device.power_production/device.power_rating).toFixed(2));
        if(device.efficiency < 0.4 && device.status != "off")
        {
          device.status = "low_power";
        }
        if(device.efficiency >= 0.4 && device.status != "off")
        {
          device.status = "ok";
        }
        //console.log(device)
      }
      else if (device.type == "battery")
      {
        device.charge_level = device.charge_level - Math.floor(Math.random() * 5);
        if(device.charge_level < 30)
        {
          device.status = "low_charge";
        }
        console.log(device)
      }
    }
    //console.log("randomised!")
}

async function updateDeviceParamsFile() {
  await db.set("devicedata", devicedata);
}

async function addToAuditLog(action){
  auditLog.push(action);
  await db.set("auditlog", auditLog);
}



app.get("/devices", async (req, res) => {
    devicedata = await db.get("devicedata");
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

app.post("/newdevice", async (req, res) => {
    if (req.body.auth==process.env.PASSWORD)
    {
      const newDevice = req.body.device;
      devicedata.push(newDevice);
      await updateDeviceParamsFile();
      res.status(201).send({ message: "Device added", device: newDevice });
      await addToAuditLog({
        user: req.body.user,
        action: "Add new device",
        details: `New Device added: ${newDevice.id}`, 
        time: utils.prettyTime()
      })
    }
    else 
    {
      res.status(401).send({error: "Incorrect password"})
      await addToAuditLog({
        user: req.body.user,
        action: "FAIL - Add new device",
        details: "Incorrect password", 
        time: utils.prettyTime()
      })
    }
});


app.post("/setdevicestatus", async (req, res) => {
  if (req.body.auth==process.env.PASSWORD)
  {
    const device = devicedata.find(device => device.id == req.body.deviceID);
    if (device) {
      device.status = req.body.status;
      await updateDeviceParamsFile();
      res.status(200).send({ message: "Device status updated", device: device });
      await addToAuditLog({
        user: req.body.user,
        action: `Updated device status to ${req.body.status}`,
        details: `Device ${device.id} status updated to ${device.status}`, 
        time: utils.prettyTime()
      })
    } else {
      res.status(404).send({ error: "Device not found" });
      await addToAuditLog({
        user: req.body.user,
        action: "FAIL - Updated device status",
        details: `Device ${req.body.id} not found`, 
        time: utils.prettyTime()
      });
    }
  }
});

app.get("/auditlog", (req, res) => {
  if(req.headers.auth==process.env.PASSWORD)
  {
    res.status(200).send(auditLog);
  }
  else
  {
    res.status(401).send({error: "Incorrect password"});
  }
  
});