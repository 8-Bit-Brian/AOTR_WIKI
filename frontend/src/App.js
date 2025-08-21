import React, { useEffect, useState } from 'react';

function Unitcard({NAME,COST}) {
  return(
    <div className="card">
      <img src="troop.png" alt="Avatar" style={{width:"100%"}} />
      <div className="container">
        <h4><b>{NAME}</b></h4>
        <p>Cost: {COST}</p>
      </div>
    </div> 
  );
};

function App() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState([]);

  // Call backend when component loads
  useEffect(() => {
    fetch("http://127.0.0.1:5000/allunits")
      .then(data => data.json())
      .then(stats => {
        console.log(stats);
        stats.map(unit => {
          console.log(unit.NAME);
        })
      })
      .catch(err => console.error("Fetch error:", err));
  }, []);

  async function SearchForUnit(event) {
    setQuery(event.target.value);

    const data = await fetch(`http://127.0.0.1:5000/unit-search?unit_name=${event.target.value}`);
    const stats = await data.json();
    console.log(stats);

    setResult(stats);
  };

  return (
    <div>
      <div>
        <input type="text" id="uname" name="unit-name" value={query} onChange={SearchForUnit}/><br />
      </div>
      <div>
        <h1>Welcome to the AOTR Unit Wiki!</h1>
        <p>The text box searches for a unit!</p>
      </div>

    
      <ul>
        {result.map(unit => (
          <Unitcard 
            key={unit.UNIT_ID} 
            NAME={unit.NAME} 
            COST={unit.COST} 
          />
        ))}
      </ul>
    </div>
  );
}

export default App;
