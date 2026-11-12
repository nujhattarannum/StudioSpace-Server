import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import {MongoClient} from 'mongodb'
import { ObjectId } from 'mongodb'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js"; // adjust path to your auth file
const app = express()
const PORT = 8000

app.use(
  cors({
    origin: process.env.CLIENT_URL, // Explicitly list your frontend URL, never use '*' with credentials
    credentials: true,               // Required for cookies and sessions to pass back and forth
  })
);
app.use(express.json())

// THIS LINE IS MANDATORY: It tells Express to catch all /api/auth/* requests and pass them to Better-Auth
app.use("/api/auth", toNodeHandler(auth));

const client = new MongoClient(process.env.MONGODB_URI );

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB() ;
const db = mongoClient.db("StudioSpace")
const studioCollection = db.collection("studio")
const bookingCollection = db.collection("booking")

const verifyApi = async(req, res ,next) =>{
  const authHeader = req.headers.authorization
  if (!authHeader){
    return res.status(401).send({msg:'Unauthorized access'})
  }

  const token = authHeader.split(" ")[1];
  if(!token){
  return res.status(401).send({msg:'Unauthorized access'})
  }
  console.log(token)
   const JWKS = createRemoteJWKSet(
      new URL(`${process.env.FRONTEND_URI}/api/auth/jwks`)
    );

    try{
        const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.FRONTEND_URI, // Should match your JWT issuer, which is the BASE_URL
      audience: process.env.FRONTEND_URI, // Should match your JWT audience, which is the BASE_URL by default
    })

    req.user = payload ;
    console.log(payload)
    } catch(error) {
        return res.status(401).send({msg:'Unauthorized access'})
    }

  next();
}

// API to add new studio
app.post('/add-studio',verifyApi,async(req,res) =>{
  try {
const studiodata = req.body;
   
// TODO: Insert studioData into your MongoDB collection here later
    const result = await studioCollection.insertOne(studiodata)

      console.log(result);

      res.send(result)

    res.status(201).json({ success: true,
       message: "Studio added successfully!" });
  } catch (error) {
    console.error("Error adding studio:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
})

app.get('/', (req,res) =>{
   
    res.send('server is running finew!')
})
 //APi to get all the studios
app.get('/studios', 
  async(req,res) =>{
   const allStudioData = await studioCollection.find().toArray()
    res.send(allStudioData)
})

//API to get the details of a specific studio
app.get('/studios/:id', async (req, res) => {
 
    const { id } = req.params;
    console.log("Looking for studio ID:", id); // <--- See what ID is printed in your server terminal
    const detail = await studioCollection.findOne({ _id: new ObjectId(id) });
    console.log("Found studio:", detail); // <--- See if this is null
     res.send(detail)
});

// API to get all my bookings with auto-completion for past dates
app.get('/my-booking/:email', verifyApi, async (req, res) => {
  try {
    const { email } = req.params;
    const currentDate = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD" format

    // 1. Automatically update past confirmed bookings to "Completed"
    await bookingCollection.updateMany(
      {
        email: email,
        status: "Confirmed",
        bookedDate: { $lt: currentDate } // Date is earlier than today
      },
      {
        $set: { status: "Completed" }
      }
    );

    // 2. Fetch all bookings for the user
    const allbookings = await bookingCollection.find({ email: email }).toArray();
    res.send(allbookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// APi from booking card component to request book

app.post("/booking-request",verifyApi, async (req, res) => {
  try {
    const { studioId, bookedDate, Time, status } = req.body;

    // 1. Only check for overlaps if the new booking is trying to be active/pending
    // (or you can check against ALL existing "Confirmed" bookings)
    const existingConflict = await db.collection("booking").findOne({
      studioId: new ObjectId(studioId),
      bookedDate: bookedDate, // Make sure date format matches (e.g., "YYYY-MM-DD")
      Time: Time,             // Exact time slot match (or use custom range logic if times vary)
      status: "Confirmed",    // 👈 Check against confirmed bookings
    });

    if (existingConflict) {
      return res.status(409 /* Conflict */).json({
        success: false,
        error: "This studio is already booked and confirmed for this date and time slot. Please choose another slot.",
      });
    }

    // 2. If no collision, proceed to save the new booking
    const newBooking = {
      ...req.body,
      studioId: new ObjectId(studioId),
      status: status || "Pending",
      createdAt: new Date(),
    };

    const result = await db.collection("booking").insertOne(newBooking);
    res.status(201).json({ success: true, bookingId: result.insertedId });
    
  } catch (error) {
    console.error("Double-booking check error:", error);
    res.status(500).json({ error: "Failed to process booking request" });
  }
});

// To update the Pending to Cancelled
app.patch("/my-booking/:id/cancel",verifyApi, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid booking ID",
      });
    }
    const result = await bookingCollection.updateOne(
      {  _id: new ObjectId(id),
        status: "Pending",
      },
      { $set: {
          status: "Cancelled",
        },
    }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Pending booking not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling booking:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
});
 // Api to show the top 6 newest studios
app.get("/featured-studios", async (req, res) => {
  try {
    const featuredStudios = await studioCollection
      .find()
      .sort({ _id: -1 }) // -1 sorts from newest to oldest based on ObjectId timestamp
      .limit(6)
      .toArray();

    res.status(200).json(featuredStudios);
  } catch (error) {
    console.error("Error fetching featured studios:", error);
    res.status(500).json({ message: "Server error" });
  }
});

 // APi to delete a listing
app.delete('/my-listings/:id' ,verifyApi, async(req, res) => {
  const {id} = req.params
  const result = await studioCollection.deleteOne({_id : new ObjectId(id)})
  res.json(result)
})

// Update booking status (Confirm or Cancelled/Reject)
app.patch('/bookings/:id/status', verifyApi,async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { status } = req.body; // Expects "Confirmed" or "Cancelled"

    // Validate that status is valid
    if (!["Confirmed", "Cancelled", "Completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value provided." });
    }

    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(bookingId) },
      { $set: { status: status } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }

    res.json({ message: `Booking status successfully updated to ${status}` });
  } catch (error) {
    console.error("Error updating booking status:", error);
    res.status(500).json({ error: "Failed to update booking status." });
  }
});

// Get all incoming booking requests for studios owned by a specific email
app.get('/owner-bookings/:email',verifyApi, async (req, res) => {
  try {
    const ownerEmail = req.params.email;
    
    // 1. Find all studios belonging to this owner (check both ownerEmail and hostEmail just in case)
    const ownerStudios = await studioCollection.find({  ownerEmail: ownerEmail 
    }).toArray();

    // Extract both IDs and Titles to match against bookings
    const studioIds = ownerStudios.map(s => s._id.toString());
    const studioTitles = ownerStudios.map(s => s.title);

    // 2. Find bookings that belong to these studios (checking studioId or studioTitle)
    const bookings = await bookingCollection.find({
      $or: [
        { studioId: { $in: studioIds } },
        { studioTitle: { $in: studioTitles } }
      ]
    }).toArray();
    res.json(bookings);
  } catch (error) {
    console.error("Error fetching owner bookings:", error);
    res.status(500).json({ error: "Failed to fetch booking requests" });
  }
});

// API for fetching my -listings
app.get('/my-listings/:email' ,verifyApi,async(req, res) => {
  const { email } = req.params
  const listedStudios = await studioCollection.find(
    { ownerEmail : email }).toArray()
  res.json(listedStudios)
})

// API to update the studios 
app.put("/studios/:id/update", verifyApi,async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }
    // Do not allow the client to change ownership fields
    delete updatedData.ownerEmail;
    delete updatedData.ownerName;
    delete updatedData._id;

    const result = await studioCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Studio not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Studio updated successfully",
    });
  } catch (error) {
    console.error("Error updating studio:", error);
    
    res.status(500).json({
      message: "Server error while updating studio",
    });
  }
});

// POST /studios/:id/reviews - Add a review to a studio
app.post("/studios/:id/reviews", verifyApi, async (req, res) => {
  try {
    const studioId = req.params.id;
    const { rating, comment } = req.body;

    console.log("Studio ID:", studioId);
    console.log("Received rating:", rating);
    console.log("Received comment:", comment);
    console.log("Authenticated user:", req.user);

    if (!ObjectId.isValid(studioId)) {
      return res.status(400).json({
        error: "Invalid studio ID format",
      });
    }
    // Extract user's name
    const author =
      req.user?.name ||
      req.user?.email?.split("@")[0] ||
      "Creator";
    // Create the new review object
    const newReview = {
      author,
      rating: Number(rating),
      date: new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      comment,
    };
    console.log("New review object:", newReview);

    // Add review to MongoDB
    const result = await studioCollection.findOneAndUpdate(
      { _id: new ObjectId(studioId) },
      { $push: { reviews: newReview } },
      { returnDocument: "after" }
    );

    // Get updated studio document
    const updatedStudio = result.value || result;
    console.log("Updated studio:", updatedStudio);

    if (!updatedStudio || !updatedStudio._id) {
      return res.status(404).json({
        error: "Studio not found",
      });
    }
    console.log("Review successfully saved!");
    res.status(200).json(updatedStudio);
  } catch (error) {
    console.error("Error submitting review:", error);

    res.status(500).json({
      error: "Failed to submit review",
    });
  }
});


// Express Route: To GET the studio which is getting updated
app.get("/studios/:id/get-update", verifyApi,async (req, res) => {
  try {
    const { id } = req.params;
   // 2. Get user email securely from the decoded JWT payload (req.user)
    const userEmail = req.user?.email; 

    if (!userEmail) {
      return res.status(401).json({ message: "Unauthorized: User email not found in token" });
    }
    // 1. Fetch ONLY the specific studio by ID from MongoDB
    const studio = await studioCollection.findOne({ _id: new ObjectId(id) });

    if (!studio) {
      return res.status(404).json({ message: "Studio not found" });
    }

    // 2. Server-side Authorization Check
    if (studio.ownerEmail.toLowerCase() !== userEmail?.toLowerCase()) {
      return res.status(403).json({ message: "Unauthorized access to this listing" });
    }

    // 3. Return the single studio object
    res.status(200).json(studio);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.listen(PORT,()=>{
    console.log(`SERVER IS RUNNING AT ${PORT}`)
});
export default app