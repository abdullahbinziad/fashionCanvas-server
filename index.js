const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");


const app = express();
const port = 3000;
require("dotenv").config();

const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const corsConfig = {
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
};

const cors = require("cors");
const jwt = require("jsonwebtoken");

app.use(cors(corsConfig));
app.use(express.json());

// verify the JWT

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unAuthorized Access" });
  }
  //bearre token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECCRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized Access" });
    }

    req.decoded = decoded;
    next();
  });
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});

//mongo db started

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kzkelcj.mongodb.net/?retryWrites=true&w=majority`;

// const uri ='mongodb://localhost:27017/content'

console.log(uri);
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const coursesCollection = client.db("Fashioncanvas").collection("courses");
    const usersCollection = client.db("Fashioncanvas").collection("users");
    const paymentCollection = client.db("Fashioncanvas").collection("payments");
    const cartCollection = client.db("Fashioncanvas").collection("carts");

    //post jwt request from headers

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECCRET, {
        expiresIn: "1h",
      });
      console.log("the generated token", token);
      res.send({ token });
    });

    //warning: use verify jwt before using verify Instructor

    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);

      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden message" });
      }
      next();
    };



    // verify the admin
    const verifyAdmin= async (req,res,next)=>{
        const email = req.decoded.email ;
        const query = {email: email}
        const user= await usersCollection.findOne(query);
        if(user.role !== 'admin'){
            return res.status(403).send({error:true, message:"Forbidden Message"});
        }
        next();
    }

// is instructor checck 
   // security layer: verifyJWT
    // email same
    // check instructor


    app.post('/users', async (req, res) => {
        const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      })

//check is it instructor --true/false 
    app.get('/users/instructor/:email',verifyJWT, async (req, res) => {
        const email = req.params.email;
  
        if (req.decoded.email !== email) {
          res.send({ instructor: false })
        }
        const query = { email: email }
        const user = await usersCollection.findOne(query);
        const result = { instructor: user?.role === 'instructor' }
        res.send(result);
      })
  //delete users


      //check is it Admin --true/false 
    app.get('/users/admin/:email',verifyJWT, async (req, res) => {
        const email = req.params.email;
  
        if (req.decoded.email !== email) {
          res.send({ admin: false })
        }
        const query = { email: email }
        const user = await usersCollection.findOne(query);
        const result = { admin: user?.role === 'admin' }
        res.send(result);
      })
  


//get the result of instructors from users collection
app.get('/instructors', async (req,res)=>{

  const query = req.query ;
  const instructors = await usersCollection.find(query).toArray();
  res.send(instructors)
})





      
      app.put('/admin/all-users/:id',verifyJWT, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const data = req.body;
        console.log(id);
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            role: data.Nowrole ==='admin' ? 'admin': 'instructor' 
          },
        };
  
        const result = await usersCollection.updateOne(filter, updateDoc,options);
        res.send(result);
  
      })
  

//get all users info from admin

app.get('/admin/all-users', verifyJWT, verifyAdmin, async (req,res)=>{

  const result = await usersCollection.find().toArray();
  res.send(result);
})

//delete user from admin
app.delete('/admin/delete-users/:id', verifyJWT, verifyAdmin, async (req,res)=>{

  const id = req.params.id ;
  const query = {_id: new ObjectId(id)}
  const result = await usersCollection.deleteOne(query);
  res.send(result);
})

//get courses data for general

app.get('/courses', async (req,res)=>{
    const result = await coursesCollection.find().sort({ Enrolled: -1 }).toArray();
    res.send(result)
})
app.get('/courses/:id', async (req,res)=>{
  const id = req.params.id;
  const query = {_id : new ObjectId(id)}
    const result = await coursesCollection.findOne(query);
    res.send(result)
})


app.put("/admin/courses/:id",verifyJWT,verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const data = req.body;
    console.log(data);
    const query = { _id: new ObjectId(id) };
    const options = { upsert: true };
    const updateCourse = {
      $set: {
        Nowstatus: data.Nowstatus,
        adminMesage: data.adminMesage,
      },
    };
    const result = await coursesCollection.updateOne(
      query,
      updateCourse,
      options
    );
    res.send(result);
  });




//GET CARTS API 
   // cart collection apis
   app.get('/carts', verifyJWT, async (req, res) => {
    const email = req.query.email;

    if (!email) {
      res.send([]);
    }

    const decodedEmail = req.decoded.email;
    if (email !== decodedEmail) {
      return res.status(403).send({ error: true, message: 'forbidden access' })
    }

    const query = { email: email };
    const result = await cartCollection.find(query).toArray();
    
    res.send(result);
  });

  app.post('/carts', async (req, res) => {
    const item = req.body;
    const result = await cartCollection.insertOne(item);
    res.send(result);
  })

  app.delete('/carts/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await cartCollection.deleteOne(query);
    res.send(result);
  })

  
// create payment intent
  app.post('/create-payment-intent', verifyJWT, async (req, res) => {
    const { price } = req.body;
console.log(price);

    const amount = parseInt(price * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'inr',
      payment_method_types: ['card'],
      metadata: {
        customer_name: "Demo name",
        customer_email: "demail mail",
      },
      shipping: {
        name: "Demo name",
        address: {
          line1: 'Street Address',
          city: 'City',
          state: 'State',
          postal_code: 'Postal Code',
          country: 'IN',
        },
      },
    });

    res.send({
      clientSecret: paymentIntent.client_secret
    })
  })


  // payment related api
   // single enrolment hanlde 
   app.post('/payments-singleEnrolled', verifyJWT, async (req, res) => {
    const payment = req.body;
    const insertResult = await paymentCollection.insertOne(payment);
   
    const query = { _id: new ObjectId(payment.cartId) }
   
    const deleteResult = await cartCollection.deleteOne(query)
    console.log("the deleted", deleteResult);

    res.send({ insertResult, deleteResult });
    // res.send(insertResult)
  })

  // //payment from carts 
  // app.post('/payments-from-cart', verifyJWT, async (req, res) => {
  //   const payment = req.body;
  //   const insertResult = await paymentCollection.insertOne(payment);

  //   const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
  //   const deleteResult = await cartCollection.deleteMany(query)

  //   res.send({ insertResult, deleteResult });
  // })



//update enroll and availale seats when user enrolled
app.put('/students/course/:id', async (req,res)=>{

  const id = req.params.id;
  const data = req.body;
  console.log(data);
  const query = { _id: new ObjectId(id) };
  const options = { upsert: true };
  const updateCourse = {
    $set: {
      Enrolled: data.Enrolled,
          
    },
  };
  const result = await coursesCollection.updateOne(
    query,
    updateCourse,
    options
  );
res.send(result);
})


//get data for students enrolled coursess
app.get("/enrolled-courses", verifyJWT, async (req, res) => {
  const filter = req.query;
 
  const paymentResults = await paymentCollection.find(filter).toArray();
  const courseIds = paymentResults.map(result => new ObjectId(result.courseId));
// console.log(courseIds);
  const enroledCourseResult = await coursesCollection.find({ _id:{ $in: courseIds }}).toArray();
// console.log("enroledCourseResult",enroledCourseResult);
  res.send(enroledCourseResult);
});






    //for instructor
    app.get("/instructor/courses",verifyJWT,verifyInstructor, async (req, res) => {
      const filter = req.query;
      let query = {};
      if (filter && filter.email) {
        query = { InstructorEmail: filter.email };
      }
      const result = await coursesCollection.find(query).toArray();
      res.send(result);
    });
    //  get a instructor single Data
    app.get("/instructor/courses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await coursesCollection.findOne(query);
      res.send(result);
    });
    //post single instructor
    app.post("/instructor/courses", verifyJWT,verifyInstructor, async (req, res) => {
      const data = req.body;

      const result = await coursesCollection.insertOne(data);
      res.send(result);
    });
    //post Delete instructor
    app.delete("/instructor/courses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await coursesCollection.deleteOne(query);
      res.send(result);
    });

    //update data
    app.put("/instructor/courses/:id",verifyJWT, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      console.log(data);
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateCourse = {
        $set: {
          InstructorEmail: data.InstructorEmail,
          InstructorName: data.InstructorName,
          Enrolled: data.Enrolled,
          Nowstatus: data.Nowstatus,
          image: data.image,
          courseTitle: data.courseTitle,
          totalSeats: data.totalSeats,
          courseOutline: data.courseOutline,
          coursePrice: data.coursePrice,
          courseDuration: data.courseDuration,
          adminMesage: data.adminMesage,
        },
      };
      const result = await coursesCollection.updateOne(
        query,
        updateCourse,
        options
      );
      res.send(result);
    });

    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
