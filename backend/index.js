// backend/index.js

const mysql = require('mysql2');
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 5000;

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

app.use(cors({ origin: 'http://127.0.0.1:3000' }));
app.use(express.urlencoded({extended: true}));
app.use(express.json());

let connection;

function connectWithRetry(retries = 10) {
  connection = mysql.createConnection(dbConfig);

  connection.connect((err) => {
    if (err) {
      console.error('MySQL connection failed:', err);
      if (retries === 0) {
        process.exit(1);
      }
      console.log(`Retrying in 3s... (${retries} retries left)`);
      setTimeout(() => connectWithRetry(retries - 1), 3000);
    } else {
      console.log('Connected to MySQL database');

      // Start server only if DB is connected

      app.get('/allunits', (req, res) => {
        const query = `select * from units;`;
        connection.query(query,(result,error) => {
          if(error){
            res.send(error);
          }
          else{
            res.send(result);
          }
        });
      });
      
      app.get('/unit-search',(req,res) =>{
        const query = `select * from units where name like '%${req.query.unit_name}%';`;
        connection.query(query,(result,error) => {
          if(error){
            res.send(error);
          }
          else{
            res.send(result);
          }
        });
      });

      app.listen(PORT, () => {
        console.log(`Backend running on port ${PORT}`);
      });

      
    }
  });
}

connectWithRetry();
