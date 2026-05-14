require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const webhookRoutes = require("./src/routes/webhookRoutes");

app.use("/webhook", webhookRoutes);

app.get("/", (req, res) => {
  res.send("Maa Jaanki Backend Running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});