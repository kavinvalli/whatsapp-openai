import express from "express";
import dotenv from "dotenv";
import { Configuration, OpenAIApi } from "openai";

dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const FROM_PHONE_NUMBER_ID = process.env.FROM_PHONE_NUMBER_ID || "";

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  return res.send("Error, wrong validation token");
});

interface RequestBody {
  object: string;
  entry: {
    id: string;
    changes: {
      value: { [key: string]: any };
      field: string;
    }[];
  }[];
}

type MessageType =
  | "audio"
  | "button"
  | "document"
  | "image"
  | "interactive"
  | "text"
  | "order"
  | "sticker"
  | "system"
  | "unknown"
  | "video";

interface Message {
  from: string;
  id: string;
  timestamp: string;
  type: MessageType;
  text: {
    body: string;
  };
  [key: string]: any;
}

interface MessageResponse {
  messaging_product: string;
  contact: {
    input: string;
    wa_id: string;
  }[];
  messages: { id: string }[];
}

const sendReply = async (
  to: string,
  reply_message: string
): Promise<MessageResponse> => {
  let json = {
    messaging_product: "whatsapp",
    to: to,
    text: { body: reply_message },
  };
  let path =
    "https://graph.facebook.com/v12.0/" + FROM_PHONE_NUMBER_ID + "/messages";

  const data = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + WHATSAPP_TOKEN,
    },
    method: "POST",
    body: JSON.stringify(json),
  });

  if (!data.ok) {
    console.error(await data.json());
    throw Error("Error sending message");
  }

  return data.json();
};

app.post("/webhook", async (req, res) => {
  const { object, entry } = req.body as RequestBody;
  const ent = entry[0];
  if (ent.changes[0].field !== "messages") {
    return res.sendStatus(400);
  }

  console.log(ent.changes[0].value);
  const messages = ent.changes[0].value["messages"] as Message[];
  if (!messages || messages.length === 0) {
    return res.sendStatus(400);
  }
  const message = messages[0];
  if (message?.type !== "text") {
    return res.sendStatus(400);
  }

  console.log(message);

  let response: MessageResponse;
  try {
    const reply = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: message.text.body,
      max_tokens: 100,
    });

    response = await sendReply(
      message.from,
      reply.data.choices[0].text || "Sorry, couldn't find a response."
    );

    return res.sendStatus(200);
  } catch (err) {
    console.error("ERROR: ", err.message);
  }

  response = await sendReply(message.from, "Something went wrong");

  // {
  //   from: '16315551181',
  //   id: 'ABGGFlA5Fpa',
  //   timestamp: '1504902988',
  //   type: 'text',
  //   text: { body: 'this is a text message' }
  // }
  return res.sendStatus(500);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
