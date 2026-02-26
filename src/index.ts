import "dotenv/config";
import express from "express";
import identifyRouter from "./routes/identify";

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/identify", identifyRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
