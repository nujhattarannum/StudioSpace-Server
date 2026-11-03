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

app.get('/studios', async(req,res) =>{
   const allStudioData = await studioCollection.find().toArray()
    res.send(allStudioData)
})



app.get('/studios/:id', async (req, res) => {
 
    const { id } = req.params;
    console.log("Looking for studio ID:", id); // <--- See what ID is printed in your server terminal
    const detail = await studioCollection.findOne({ _id: new ObjectId(id) });
    console.log("Found studio:", detail); // <--- See if this is null
     res.send(detail)
});


app.delete('/my-listings/:id' , async(req, res) => {
  const {id} = req.params
  const result = await studioCollection.deleteOne({_id : new ObjectId(id)})
  res.json(result)
})
app.listen(PORT,()=>{
    console.log(`SERVER IS RUNNING AT ${PORT}`)
})