const router = require("express").Router();
const bcrypt = require("bcrypt");
const Users = require("../models/Users");
const jwt = require("jsonwebtoken");
const Agency = require("../models/Agency");
const Models = require("../models/Models");
const Admin = require("../models/Admin");
const { verifyTokenAndAdmin } = require("./jwt");
const Client = require("../models/Client");
const { sendConfirmationEmail } = require("../config/nodemailer.config");
const UserLogin = require("../models/UserLogin");
const notification = require("../services/notifications");
const { passwordRecovery } = require("../config/passwordRecovery.config");
const Ambssador = require("../models/Ambssador");

// registration
router.post("/register", async (req, res) => {
  try {
    // encrypt password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    //   check if user exist
    const findUser = await Users.findOne({ email: req.body.email });

    if (!findUser) {
      const newUser = new Users({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: hashedPassword,
        role: req.body.role,
        mobileNo: req.body.mobileNo,
        referral: req.body.referral,
      });

      await newUser.save();

      if (req.body.referral) {
        const amb = await Ambssador.findOne({ code: newUser.referral });

        await amb.updateOne({ $push: { models: newUser.id } });
        await amb.updateOne({ $inc: { pendingModels: +1 } });
      }

      const accessToken = jwt.sign(
        {
          id: newUser._id,
          uuid: newUser._id,
          role: newUser.role,
          email: newUser.email,
        },
        process.env.JWT_SEC,
        {
          expiresIn: "30m",
        }
      );

      const { password, ...others } = newUser._doc;

      switch (newUser.role) {
        case "agency":
          const newAgency = new Agency({
            uuid: newUser._id,
            email: newUser.email,
            fullName: newUser.firstName + " " + newUser.lastName,
          });
          await newAgency.save();
          break;

        case "model":
          const newModel = new Models({
            uuid: newUser._id,
            email: newUser.email,
            fullName: newUser.firstName + " " + newUser.lastName,
          });
          await newModel.save();
          break;

        case "client":
          const newClient = new Client({
            uuid: newUser._id,
            email: newUser.email,
          });
          await newClient.save();
          break;

        default:
          await newUser.save();
          break;
      }

      if (newUser.role === "client") {
        res
          .status(200)
          .json("Registration successful! Please proceed to login");

        sendConfirmationEmail((email = newUser.email));

        await notification.sendNotification({
          notification: {},
          notTitle:
            newUser.firstName +
            " " +
            newUser.lastName +
            " just created a new account, kindly view their profile.",
          notId: "639dc776aafcd38d67b1e2f7",
          notFrom: newUser.id,
        });
      } else {
        res.status(200).json({
          message:
            "Registration successful! Please proceed to make your subscription payment",
          accessToken,
        });

        sendConfirmationEmail((email = newUser.email));

        await notification.sendNotification({
          notification: {},
          notTitle:
            newUser.firstName +
            " " +
            newUser.lastName +
            " just created a new account, kindly view their profile.",
          notId: "639dc776aafcd38d67b1e2f7",
          notFrom: newUser.id,
        });
      }
    } else {
      res.status(400).json("User already exists!");
    }
  } catch (err) {
    res.status(500).json("Connection error!");
  }
});

// login
router.post("/login", async (req, res) => {
  try {
    const user = await Users.findOne({ email: req.body.email });
    const agency = await Agency.findOne({ uuid: user?.id });
    const model = await Models.findOne({ uuid: user?.id });
    const client = await Client.findOne({ uuid: user?.id });
    const login = await UserLogin.findById("64642190c062e98f1d5ba23e");

    if (user) {
      if (bcrypt.compareSync(req.body.password, user.password)) {
        if (user.role === "client" && !user.isVerified) {
          const accessToken = jwt.sign(
            {
              id: user._id,
              uuid: user._id,
              role: user.role,
              email: user.email,
            },
            process.env.JWT_SEC,
            {
              expiresIn: "1h",
            }
          );

          const {
            password,
            transactionPin,
            currentTransactionPin,
            recovery,
            exp,
            ...others
          } = user._doc;
          await login.updateOne({ $inc: { login: +1 } });

          res.status(200).json({ ...others, client, accessToken });
        } else {
          const accessToken = jwt.sign(
            {
              id: user._id,
              uuid: user._id,
              role: user.role,
              email: user.email,
            },
            process.env.JWT_SEC,
            {
              expiresIn: "30d",
            }
          );

          const {
            password,
            transactionPin,
            currentTransactionPin,
            recovery,
            exp,
            ...others
          } = user._doc;

          switch (user.role) {
            case "agency":
              if (user.isSubscribed) {
                await login.updateOne({ $inc: { login: +1 } });

                res.status(200).json({ ...others, agency, accessToken });
              } else {
                res.status(403).json({
                  message:
                    "Please proceed to make your subscription payment before you can login",
                  accessToken,
                  userRole: user.role,
                });
              }
              break;

            case "model":
              if (user.isSubscribed) {
                await login.updateOne({ $inc: { login: +1 } });

                res.status(200).json({ ...others, model, accessToken });
              } else {
                res.status(403).json({
                  message:
                    "Please proceed to make your subscription payment before you can login",
                  accessToken,
                  userRole: user.role,
                });
              }
              break;

            default:
              await login.updateOne({ $inc: { login: +1 } });

              res.status(200).json({ ...others, client, accessToken });
              break;
          }
        }
      } else {
        res.status(400).json({ message: "Email or password incorrect" });
      }
    } else {
      res.status(400).json({ message: "Email or password incorrect" });
    }
  } catch (err) {
    // console.log(err)
    res.status(500).json({ message: "Connection error!" });
  }
});

// admin registration
router.post("/create-pma/admin", verifyTokenAndAdmin, async (req, res) => {
  // encrypt password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(req.body.password, salt);

  //   check if user exist
  const findUser =
    (await Admin.findOne({ username: req.body.username })) ||
    (await Admin.findOne({ email: req.body.email }));

  try {
    if (!findUser) {
      const newUser = new Admin({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        username: req.body.username,
        email: req.body.email,
        password: hashedPassword,
        adminRole: req.body.role,
      });

      await newUser.save();

      res.status(200).json("Registration successful!");
    } else {
      res.status(400).json("User already exists!");
    }
  } catch (err) {
    res.status(500).json("Connection error!");
  }
});

// admin login
router.post("/login-pma/admin", async (req, res) => {
  try {
    const user = await Admin.findOne({ email: req.body.email });

    if (user) {
      if (bcrypt.compareSync(req.body.password, user.password)) {
        const accessToken = jwt.sign(
          { id: user._id, aai: user.aai, role: user.role },
          process.env.JWT_SEC,
          {
            expiresIn: "6h",
          }
        );

        const { password, isAdmin, aai, ...others } = user._doc;

        res.status(200).json({ ...others, accessToken });
      } else {
        res.status(400).json("Email or password incorrect");
      }
    } else {
      res.status(400).json("Email or password incorrect");
    }
  } catch (err) {
    res.status(500).json("Connection error!");
  }
});

// forgot password processes

//  enter email
router.post("/password-recovery", async (req, res) => {
  // generate subscription reference num
  const confirmMin = Math.ceil(10000);
  const confirmMax = Math.floor(90000);
  const confirm =
    Math.floor(Math.random() * (confirmMax - confirmMin + 1)) + confirmMin;

  try {
    const user = await Users.findOne({ email: req.body.email });

    if (user) {
      const currentTime = new Date();
      const futureTime = new Date(
        currentTime.setMinutes(currentTime.getMinutes() + 15)
      );

      await user.updateOne({ $set: { recovery: confirm } });
      await user.updateOne({ $set: { exp: futureTime } });

      passwordRecovery((email = user.email), (code = confirm));

      res
        .status(200)
        .json({ message: "Recovery code has been sent to your email." });
    } else {
      res.status(404).json("Email not found.");
    }
  } catch (err) {
    res.status(500).json("Connection error!");
  }
});

// verify code
router.post("/verify-code", async (req, res) => {
  try {
    const user = await Users.findOne({ recovery: req.body.recovery });

    if (user) {
      const currentTime = new Date();
      const totalSeconds = (currentTime - user.exp) / 1000;

      if (user.exp > currentTime) {
        const accessToken = jwt.sign(
          {
            id: user._id,
            uuid: user._id,
            role: user.role,
            email: user.email,
          },
          process.env.JWT_SEC,
          {
            expiresIn: "15m",
          }
        );

        const {
          password,
          transactionPin,
          currentTransactionPin,
          recovery,
          exp,
          ...others
        } = user._doc;

        await user.updateOne({ $set: { recovery: null } });

        res.status(200).json({ id: user.id, accessToken: accessToken });
      } else {
        res.status(403).json("Recovery code expired already.");
      }
    } else {
      res.status(400).json("The recovery code you entered is incorrect!");
    }
  } catch (err) {
    res.status(500).json("Connection error!");
  }
});

module.exports = router;
