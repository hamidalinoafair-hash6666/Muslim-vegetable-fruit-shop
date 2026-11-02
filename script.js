* Color Theme: Fresh Nature Green & Professional Textures */
:root {
    --primary-color: #2e7d32;
    --accent-color: #4caf50;
    --bg-light: #f1f8e9;
    --dark-text: #263238;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

body {
    background-color: #fafafa;
    color: var(--dark-text);
}

header {
    background-color: var(--primary-color);
    color: white;
    text-align: center;
    padding: 20px 10px;
}

header p {
    font-size: 0.9rem;
    opacity: 0.9;
    margin-top: 5px;
}

.nav-links {
    margin-top: 10px;
}

.admin-btn {
    color: white;
    text-decoration: none;
    font-size: 0.85rem;
    background: rgba(255,255,255,0.2);
    padding: 5px 10px;
    border-radius: 4px;
}

main {
    max-width: 1200px;
    margin: 20px auto;
    padding: 10px;
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 20px;
}

/* Make full screen stack grid layout on phones */
@media (max-width: 768px) {
    main {
        grid-template-columns: 1fr;
    }
}

h2 {
    border-bottom: 2px solid var(--accent-color);
    padding-bottom: 5px;
    margin-bottom: 15px;
    color: var(--primary-color);
}

/* Vegetable Cards Alignment Grid Layout */
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 15px;
}

.card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    padding: 15px;
    text-align: center;
    border: 1px solid #e0e0e0;
}

.card img {
    width: 100%;
    height: 140px;
    object-fit: cover;
    border-radius: 6px;
}

.card h3 {
    margin: 10px 0 5px 0;
    font-size: 1.1rem;
}

.card .price {
    font-weight: bold;
    color: var(--primary-color);
    margin-bottom: 10px;
}

.card select {
    width: 100%;
    padding: 6px;
    margin-bottom: 10px;
    border-radius: 4px;
    border: 1px solid #ccc;
}

.card button, #login-panel button {
    background-color: var(--accent-color);
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    width: 100%;
}

/* Cart & Form Formatting Styles */
#cart-section {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    height: fit-content;
}

.cart-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px dashed #ccc;
    font-size: 0.95rem;
}

.delete-btn {
    background: none;
    border: none;
    cursor: pointer;
}

.cart-total {
    text-align: right;
    margin: 15px 0;
    font-size: 1.1rem;
}

#order-form input, #order-form textarea {
    width: 100%;
    padding: 10px;
    margin-bottom: 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

.whatsapp-btn {
    background-color: #25d366;
    color: white;
    border: none;
    width: 100%;
    padding: 12px;
    font-size: 1rem;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
}

/* Secure Admin Panel Styles Layout */
.auth-card {
    background: white;
    max-width: 400px;
    margin: 50px auto;
    padding: 30px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    text-align: center;
}

.auth-card input {
    width: 100%;
    padding: 10px;
    margin: 15px 0;
}

.admin-row {
    background: white;
    padding: 15px;
    margin-bottom: 10px;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.admin-row button {
    background: var(--primary-color);
    color: white;
    border: none;
    padding: 5px 10px;
    margin-left: 5px;
    border-radius: 4px;
}
