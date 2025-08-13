import React, { useEffect, useState } from 'react';

function App() {
  const [units, setUnits] = useState([]);

  // Call backend when component loads
  useEffect(() => {
    fetch("http://127.0.0.1:5000/allunits")
      .then(data => data.json())
      .then(stats => {
        console.log(stats);
        stats.forEach(unit => {
          console.log(unit.NAME);
        })
      })
      .catch(err => console.error("Fetch error:", err));
  }, []);

  // Run whenever units is changed
  function SearchForUnit(event) {
    setUnits(event.target.value);
    fetch(`http://127.0.0.1:5000/unit-search?unit_name=${event.target.value}`)
    .then(data => data.json())
    .then(stats => {
      stats.forEach(unit => {
        console.log(unit.NAME);
      });
    })
    .catch(err => console.log(`Failed to find unit! Error: ${err}`))
  };
  return (
    <div>
      <div>
        <input type="text" id="uname" name="unit-name" value={units} onChange={SearchForUnit}></input><br></br>
      </div>
      <div>
        <h1>Hello World</h1>
        <p>The text box searches for a unit!</p>
      </div>
  </div>
  );
}

export default App;
