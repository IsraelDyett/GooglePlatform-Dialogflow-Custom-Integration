/**
 * This custom Integration was built upon GoogleCloudPlatform/dialogflow-integrations
 * Copyright 2019 Google Inc. All Rights Reserved.
 * 
 * GoogleCloudPlatform Dialogflow-Integrations Repository:
 * https://github.com/GoogleCloudPlatform/dialogflow-integrations/tree/master
 * 
 * 
 * In this custom Integration build upon GoogleCloudPlatform's Dialogflow integration,
 * the dialogflow Agent is deployed on Custom Webstie, Meta: (Facebook, Instagram and Whatsapp), Email(configured with Zappier)
 * 
 * This code is open source and free to reuse and refactor :)
 * I suggest that you Start by understanding GoogleCloudPlatform Dialogflow-Integrations configuration first (Repository given above)
 * aswell as Meta Facebook developer platform.
 */

const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const app = express();
const dialogflowSessionClient = require('../botlib/dialogflow_session_client.js');
const twilio = require('twilio');
const nodemailer = require("nodemailer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const { google } = require('googleapis');
const moment = require('moment');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const projectId = process.env.GOOGLE_PROJECT_ID

// Twilio WhatsApp API credentials and setup
const accountSid = process.env.TWILIO_SID 
const authToken = process.env.TWILIO_AUTH
const client = require('twilio')(accountSid, authToken);
const twilioClient = twilio(accountSid, authToken);
const sessionClient = new dialogflowSessionClient(projectId);

// Instagram API credentials                             
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN;

// Google Calendar API credentials and setup
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'); 
const calendar = google.calendar({
  version: 'v3',
  auth: new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  }),
});

// Gemini API credentials and setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

// Nodemailer setup for sending emails
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SERVICE_EMAIL,
    pass: process.env.MAIL_PASSWORD,
  },
});

// Start the server
const listener = app.listen(process.env.PORT || 3000, function() {
  console.log('Your server is listening on port ' + listener.address().port);
});

// Fulfillment route for handling Dialogflow requests
app.post('/fulfillment', async function(req, res) {
  try {
    const queryResult = req.body.queryResult;
    const userQuery = queryResult.queryText;
    const intentName = queryResult.intent.displayName;
    
    // Handle the intent
    let responseText;
    switch (intentName) {
      case 'book Appointment' || 'ask_for_email' || 'ask_for_name':
        let { date, time, email, name } = queryResult.parameters;
        
        // Request email if not provided
        if (!email) {
          res.json({
            followupEventInput: {
              name: 'ask_for_email',
              languageCode: 'en-US',
              parameters: { date, time }
            }
          });
          console.log('ask_for_email');
          return;
        }

        // Request name if not provided
        if (!name) {
          res.json({
            followupEventInput: {
              name: 'ask_for_name',
              languageCode: 'en-US',
              parameters: { date, time, email }
            }
          });
          console.log('ask_for_name');
          return;
        }

        const startTime = moment(date).toDate(); 
        const endTime = moment(startTime).add(1, 'hour').toDate(); 

        console.log('startTime', startTime);
        console.log('endTime', endTime);

        // Create event on Google Calendar
        const event = {
          summary: `Consultation appointment with ${name}`,
          description: `Appointment booked via ChatBOT\n\nClient Name: ${name}\nClient Email: ${email}`,
          start: {                                         
            dateTime: startTime.toISOString(),
          },
          end: {
            dateTime: endTime.toISOString(),
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 }, 
              { method: 'popup', minutes: 30 },
            ],
          },
        };

        calendar.events.insert({
          calendarId: GOOGLE_CALENDAR_ID,
          resource: event,
        }, (err, event) => {
          if (err) {
            console.error('Error booking appointment:', err);
            res.status(500).json({ error: 'Failed to book appointment' });
            return;
          }
          console.log('Appointment booked successfully:', event.data);
          console.log('Appointment booked successfully link:', event.data.htmlLink);

          const confirmationMessage = `Appointment booked successfully!\n\nSummary: ${event.data.summary}\nStart Time: ${startTime}\nEnd Time: ${endTime}\n\n Join The Meeting via the link.\nLink: ${event.data.htmlLink}`;

          res.json({ fulfillmentText: confirmationMessage });
        });
        return; 

      // Use generative AI for general intents 
      case 'general':
        const result = await model.generateContent(userQuery);
        const response = await result.response;
        const text = response.text();
        responseText = text;
        res.json({
          fulfillmentText: responseText,
        });
        return; 

      default:
        responseText = `I'm not sure how to handle the intent: ${intentName}`;
    }

    res.json({
      fulfillmentText: responseText,
    });

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Error processing request');
  }
});

// Email route for handling email requests
app.post('/Email', async function(req, res) {
  console.log("We here babe");

  const body = req.body;
  const text = body.Body;
  const id = body.From;
  const emailSubject = body.Subject;

  try {
    const preprocessText = preprocessText(text);
    
    dialogflowResponse = await sessionClient.detectIntent(test, id, body);
    console.log("dialogflowResponse:", dialogflowResponse);
    
    const mailOptions = {
      from: process.env.BUSINESS_EMAIL,
      to: body.Email,
      subject: emailSubject,
      text: dialogflowResponse.fulfillmentText,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);
    res.status(200).json({message: "Email sent successfully!"});

    res.status(200).send('Message sent to Dialogflow and processed.');
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Error processing request');
  }
});

// Instagram verification route
app.get('/Instagram', function(req, res) {
  if (req.query['hub.verify_token'] === INSTAGRAM_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.send('Invalid verification token');
  }
});

// Instagram route for handling Instagram messages
app.post('/Instagram', async function(req, res) {
  if (req.query['hub.verify_token'] === INSTAGRAM_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.send('Invalid verification token');
  }

  try {
    const body = req.body;
    const dialogflowResponse = await dialogflowSessionClient.detectIntent(body.message, body.userId, body);
    const responseMessage = dialogflowResponse.fulfillmentText;
    
    // Send the response back to Instagram
    request({
      url: `https://graph.facebook.com/v11.0/me/messages?access_token=${INSTAGRAM_ACCESS_TOKEN}`,
      method: 'POST',
      json: {
        recipient: { id: userId },
        message: { text: responseMessage }
      }
    }, (error, response, body) => {
      if (error) {
        console.error('Error sending message to Instagram:', error);
      } else if (response.body.error) {
        console.error('Error:', response.body.error);
      }
    });

    res.status(200).send('Message sent to Dialogflow and processed.');
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Error processing request');
  }
});

// WhatsApp route for handling WhatsApp messages
app.post('/whatsApp', async function(req, res) {
  const body = req.body;
  const text = body.Body;
  const id = body.From;

  console.log("id:", id);
  console.log("text:", text);
  console.log("body:", body);

  try {
    dialogflowResponse = await sessionClient.detectIntent(text, id, body);
    console.log("dialogflowResponse:", dialogflowResponse);

    // Send response via Twilio
    client.messages
    .create({
        body: dialogflowResponse.fulfillmentText,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: id
    })
    .then(message => console.log(message.sid))
    .done();

    res.status(200).send('Message sent to Dialogflow and processed.');
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Error processing request');
  }
});

// Gracefully handle termination
process.on('SIGTERM', () => {
  listener.close(() => {
    console.log('Closing http server.');
    process.exit(0);
  });
});