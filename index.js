import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import {MongoClient} from 'mongodb'
import { ObjectId } from 'mongodb'
const app = express()
const PORT = 8000

app.use(cors())
app.use(express.json())
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

const verifyApi = (req, res ,next) =>{
  const authHeaders = req.headers.authorization
  if (authHeaders!=="user logged in"){
    return res.status(401).send({msg:'Unauthorized'})
  }
  next();
}

// API to add new studio
app.post('/add-studio', async(req,res) =>{
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

app.get('/studios', 
  verifyApi,
  async(req,res) =>{
   const allStudioData = await studioCollection.find().toArray()
    res.send(allStudioData)
})

app.post('/booking', async(req,res) =>{
  try{
  const data = req.body
  const result = await bookingCollection.insertOne(data)
 console.log("✅ Database Insert Result:", result);

    res.send(result);
  } catch (error) {
    // 3. Log any backend errors
    console.error("❌ Error saving booking:", error);
    res.status(500).json({ error: "Failed to save booking" });
  }
});

app.get('/studios/:id', async (req, res) => {
 
    const { id } = req.params;
    console.log("Looking for studio ID:", id); // <--- See what ID is printed in your server terminal
    const detail = await studioCollection.findOne({ _id: new ObjectId(id) });
    console.log("Found studio:", detail); // <--- See if this is null
     res.send(detail)
});

// API to get all my bookings 
app.get('/my-booking/:email', async (req, res) => {
 
    const { email } = req.params;
   
    const allbookings = await bookingCollection.find({ email:email }).toArray();
  
    console.log("Found studio:", allbookings); // <--- See if this is null
     res.send(allbookings)
});

// To update the Pending to Cancelled
app.patch("/my-booking/:id/cancel", async (req, res) => {
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
app.delete('/my-listings/:id' , async(req, res) => {
  const {id} = req.params
  const result = await studioCollection.deleteOne({_id : new ObjectId(id)})
  res.json(result)
})


// API for fetching my -listings
app.get('/my-listings/:email' , async(req, res) => {
  const { email } = req.params
  const listedStudios = await studioCollection.find(
    { ownerEmail : email }).toArray()
  res.json(listedStudios)
})

// API to update the studios 
app.put("/studios/:id", async (req, res) => {
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

// Express Route: To GET the studio which is getting updated
app.get("/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.headers["x-user-email"]; // Or get session/user from your auth middleware

    // 1. Fetch ONLY the specific studio by ID from MongoDB
    const studio = await studioCollection.findById(id);

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