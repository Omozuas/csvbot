const mongoose=require('mongoose');
const dotenv = require('dotenv').config()

const uri= process.env.MONG_URL

async function connect(){
  try {
    await mongoose.connect(uri,
      {
      // useNewUrlParser:true,
      // useUnifiedTopology: true,
     
    }
    );
    console.log('csv_csv connected to db')
    
  } catch (error) {
    console.log(`error db ${uri}`)
    console.error(error)
  }
}


module.exports= connect;