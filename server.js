require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/assets", express.static(path.join(__dirname, "assets")));

const webhookRoutes = require("./src/routes/webhookRoutes");
const apiRoutes = require("./src/routes/apiRoutes");
const { payPage } = require("./src/controllers/payController");

app.use("/webhook", webhookRoutes);
app.use("/api", apiRoutes);
app.get("/pay", payPage);

app.get("/", (req, res) => {
  res.send("Maa Jaanki Backend Running");
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;