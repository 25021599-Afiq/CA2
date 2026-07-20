const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'c237005@2026',
    database: 'C237 Database'
  });

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

//TO DO: Insert code for Session Middleware below 
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/index');
    }
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { Userid, Username, Password, Email, Contact, BorrowingLimit, IsAdmin } = req.body;

    if (!Userid ||!Username || !Password || !Email || !Contact|| !BorrowingLimit || !IsAdmin) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Define routes
app.get('/',  (req, res) => {
    res.render('index', {user: req.session.user} );
});

app.get('/comicinventory', checkAuthenticated, checkAdmin, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM comics', (error, results) => {
      if (error) throw error;
      res.render('inventory', { comics: results, user: req.session.user });
    });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {

    const { username, email, passwprd, contact, BorrowingLimit, IsAdmin } = req.body;

    const sql = 'INSERT INTO users (username, password, email, contact, BorrowingLimit, IsAdmin) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    connection.query(sql, [username, password, email, contact, BorrowingLimit, IsAdmin], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { Email, Password } = req.body;

    // Validate email and password
    if (!Email || !Password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            // Successful login
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            if(req.session.user.role == 'user')
                res.redirect('/index');
            else
                res.redirect('/comicinventory');
        } else {
            // Invalid credentials
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/bookingComic', checkAuthenticated, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM comics', (error, results) => {
        if (error) throw error;
        res.render('booking', { user: req.session.user, comics: results });
      });
});

app.post('/bookingComic /:id', checkAuthenticated, (req, res) => {
    const comicId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;

    connection.query('SELECT * FROM comics WHERE comicId = ?', [comicId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const comic = results[0];

            // Initialize booking in session if not exists
            if (!req.session.cart) {
                req.session.cart = [];
            }

            // Check if comic already in wishlist
            const existingItem = req.session.cart.find(item => item.comicId === comicId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.wishlist.push({
                    comicId: comic.comicId,
                    title: comic.comicTitle,
                    series: comic.comicseries,
                    IssueNo: comic.comicIssueNo,
                    publisher: comic.publisher,
                    publishedYear: comic.publishedYear,
                    quantity: comic.quantity,
                    image: comic.image
                });
            }

            res.redirect('/cart');
        } else {
            res.status(404).send("Comic not found");
        }
    });
});

app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/comic/:id', checkAuthenticated, (req, res) => {
  // Extract the comic ID from the request parameters
  const comicId = req.params.id;

  // Fetch data from MySQL based on the comic ID
  connection.query('SELECT * FROM comic WHERE comicId = ?', [comicId], (error, results) => {
      if (error) throw error;

      // Check if any comic with the given ID was found
      if (results.length > 0) {
          // Render HTML page with the comic data
          res.render('comic', { comic: results[0], user: req.session.user  });
      } else {
          // If no comic with the given ID was found, render a 404 page or handle it accordingly
          res.status(404).send('Comic not found');
      }
  });
});

app.get('/addComic', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addComic', {user: req.session.user } ); 
});

app.post('/addComic', upload.single('image'),  (req, res) => {
    // Extract product data from the request body
    const { comicId, title, series, IssueNo, publisher, publishedYear, quantity, image} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }

    const sql = 'INSERT INTO comics (comicName, title, series, Issue Number,publisher,publishedYear,image) VALUES (?, ?, ?, ?)';
    // Insert the new product into the database
    connection.query(sql , [comicId, title, series,IssueNo,publisher,publishedYear,quantity,image], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding comic:", error);
            res.status(500).send('Error adding comic    ');
        } else {
            // Send a success response
            res.redirect('/comicInventory');
        }
    });
});

app.get('/updateComic/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const comictId = req.params.id;
    const sql = 'SELECT * FROM comic WHERE comicId = ?';

    // Fetch data from MySQL based on the comic ID
    connection.query(sql , [comicId], (error, results) => {
        if (error) throw error;

        // Check if any comic with the given ID was found
        if (results.length > 0) {
            // Render HTML page with the product data
            res.render('updateComic', { comic: results[0] });
        } else {
            // If no comic with the given ID was found, render a 404 page or handle it accordingly
            res.status(404).send('Comic not found');
        }
    });
});

app.post('/updateComic/:id', upload.single('image'), (req, res) => {
    const comicId = req.params.id;
    // Extract comic data from the request body
    const { comicId, title,series, IssueNo, publisher, publishedYear, quantity, image  } = req.body;
    let image  = req.body.currentImage; //retrieve current image filename
    if (req.file) { //if new image is uploaded
        image = req.file.filename; // set image to be new image filename
    } 

    const sql = 'UPDATE comics SET comicId = ? , title = ?, series = ?, IssueNo =?, Publisher =?, PublishedYear =?, Quantity =?, image =? WHERE comicId = ?';
    // Insert the new product into the database
    connection.query(sql, [comicId, title, series, IssueNo, publisher, publishedYear, quantity, image], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error updating comic:", error);
            res.status(500).send('Error updating comic');
        } else {
            // Send a success response
            res.redirect('/comicInventory');
        }
    });
});

app.get('/deleteComic/:id', (req, res) => {
    const comicId = req.params.id;

    connection.query('DELETE FROM comics WHERE comictId = ?', [comicId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting comic:", error);
            res.status(500).send('Error deleting comic');
        } else {
            // Send a success response
            res.redirect('/comicInventory');
        }
    });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on port http://localhost:3000')); 
