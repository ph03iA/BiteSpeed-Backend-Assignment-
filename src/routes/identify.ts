import { Router, Request, Response } from "express";
import { identifyContact } from "../services/contact.service";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;

    const emailStr = email ? String(email).trim() : null;
    const phoneStr = phoneNumber ? String(phoneNumber).trim() : null;

    if (!emailStr && !phoneStr) {
      res.status(400).json({
        error: "At least one of email or phoneNumber must be provided",
      });
      return;
    }

    const result = await identifyContact(emailStr, phoneStr);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in /identify:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
