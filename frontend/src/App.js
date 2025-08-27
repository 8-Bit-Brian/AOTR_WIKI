import React, { useEffect, useState } from 'react';
import Unitcard from './components/Unitcard';
import './assets/fonts/fonts.css';
import './App.css';



function App() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState([]);

  // Call backend when component loads
  useEffect(() => {
    const fetch_all_units = async () => {
      const data = await fetch("http://127.0.0.1:5000/allunits");
      const stats = await data.json();
      console.log(stats);
      setResult(stats);
    };
    fetch_all_units();
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
        <h1 class="title" >Welcome to the Age of the Ring Unit Wiki</h1>
      </div>
      <div>
        <input type="text" id="uname" name="unit-name" value={query} onChange={SearchForUnit}/><br />
      </div>

    
      <ul className="card-container">
        {result.map(troop => (
          <Unitcard key={troop.UNIT_ID} unit={troop} />
        ))}
      </ul>
    </div>
  );
}

export default App;
