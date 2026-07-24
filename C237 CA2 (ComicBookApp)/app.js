const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();
const multer = require('multer');
const path = require('path');

// Set up storage location and filename rules
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/images'); 
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); 
  }
});

const upload = multer({ storage: storage });

const db = mysql.createConnection({
    host: 'c237-meilan-mysql.mysql.database.azure.com',
    user: 'c237_005',
    password: 'c237005@2026!',
    database: 'C237_005_team1_ca2',
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: false, cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } }));
app.use(flash());

const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this resource.');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.IsAdmin) return next();
    req.flash('error', 'Admin access only.');
    res.redirect('/comics');
};

app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/comics');
    } else {
        res.redirect('/login');
    }
});

app.get('/register', (req, res) => res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] || {} }));

app.post('/register', (req, res) => {
    const { username, email, password, contact, IsAdmin } = req.body;
    if (!username || !email || !password || password.length < 6) {
        req.flash('error', 'Username, email and a password of at least 6 characters are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    const sql = 'INSERT INTO Users (Username, Password, Email, Contact, IsAdmin) VALUES (?, SHA1(?), ?, ?, ?)';
    db.query(sql, [username, password, email, contact || null, IsAdmin === 'true'], (err) => {
        if (err) {
            req.flash('error', err.code === 'ER_DUP_ENTRY' ? 'Username or email already exists.' : 'Unable to register user.');
            req.flash('formData', req.body);
            return res.redirect('/register');
        }
        req.flash('success', 'Registration successful. Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => res.render('login', { messages: req.flash('success'), errors: req.flash('error') }));

app.post('/login', (req, res) => {
    db.query('SELECT * FROM Users WHERE Email = ? AND Password = SHA1(?)', [req.body.email, req.body.password], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }
        req.session.user = results[0];
        res.redirect('/comics');
    });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.get('/comics', checkAuthenticated, (req, res) => {
    db.query('SELECT * FROM Comics ORDER BY Title, Series, IssueNo', (err, results) => {
        if (err) throw err;
        res.render('index', { comics: results, user: req.session.user, messages: req.flash('success'), errors: req.flash('error') });
    });
});

app.get('/comic/:id', checkAuthenticated, (req, res) => {
    db.query('SELECT * FROM Comics WHERE ComicId = ?', [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('Comic not found.');
        res.render('comic', { comic: results[0], user: req.session.user });
    });
});

app.get('/add', checkAuthenticated, checkAdmin, (req, res) => res.render('add', { user: req.session.user }));
app.post('/add', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => {
  const { comicId, title, series, issueNo, publisher, publishedYear, quantity } = req.body;
  const imagePath = req.file ? req.file.filename : null;

  const sql = 'INSERT INTO Comics (ComicId, Title, Series, IssueNo, Publisher, PublishedYear, Quantity, ImagePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  
  const queryParams = [
    comicId, 
    title, 
    series || null, 
    issueNo, 
    publisher || null, 
    publishedYear || null, 
    quantity, 
    imagePath
  ];

  db.query(sql, queryParams, (err, result) => {
    if (err) {
      console.error('Database Error:', err);
      return res.status(500).send('Database error occurred: ' + err.message);
    }

    req.flash('success', 'Comic added successfully.');
    res.redirect('/comics');
  });
});

app.get('/editComic/:id', checkAuthenticated, checkAdmin, (req, res) => {
    db.query('SELECT * FROM Comics WHERE ComicId = ?', [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('Comic not found.');
        res.render('edit', { comic: results[0], user: req.session.user });
    });
});
app.post('/editComic/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const { title, series, issueNo, publisher, publishedYear, quantity } = req.body;
    db.query('UPDATE Comics SET Title = ?, Series = ?, IssueNo = ?, Publisher = ?, PublishedYear = ?, Quantity = ? WHERE ComicId = ?', [title, series || null, issueNo, publisher || null, publishedYear || null, quantity, req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Comic updated successfully.');
        res.redirect('/comics');
    });
});

app.get('/deleteComic/:id', checkAuthenticated, checkAdmin, (req, res) => {
    db.query('SELECT * FROM Comics WHERE ComicId = ?', [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('Comic not found.');
        res.render('delete', { comic: results[0], user: req.session.user });
    });
});
app.post('/deleteComic/:id', checkAuthenticated, checkAdmin, (req, res) => {
    db.query('DELETE FROM Comics WHERE ComicId = ?', [req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Comic deleted successfully.');
        res.redirect('/comics');
    });
});


app.get('/booking', checkAuthenticated, (req, res) => {
    db.query('SELECT * FROM Comics WHERE Quantity > 0 ORDER BY Title', (err, results) => {
        if (err) throw err;
        res.render('booking', { comics: results, user: req.session.user, errors: req.flash('error') });
    });
});
app.post('/booking/:id', checkAuthenticated, (req, res) => {
    const quantity = Number.parseInt(req.body.quantity, 10) || 1;
    db.query('SELECT * FROM Comics WHERE ComicId = ?', [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0 || results[0].Quantity < quantity) {
            req.flash('error', 'Not enough copies are available.');
            return res.redirect('/bookingComic');
        }
        const comic = results[0];
        db.query('INSERT INTO Borrowed (UserId, ComicId, BorrowedQty, BorrowedDate, DueDate) VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY))', [req.session.user.UserId, comic.ComicId, quantity], (borrowErr) => {
            if (borrowErr) throw borrowErr;
            db.query('UPDATE Comics SET Quantity = Quantity - ? WHERE ComicId = ?', [quantity, comic.ComicId], (updateErr) => {
                if (updateErr) throw updateErr;
                req.flash('success', 'Comic booked successfully.');
                res.redirect('/comics');
            });
        });
    });
});

app.get('/feedback', checkAuthenticated, (req, res) => {
    const sql = "SELECT * FROM Feedback ORDER BY date DESC";
    
    db.query(sql, (err, results) => {
        if (err) throw err;
        
        res.render('feedback', {
            user: req.session.user,
            feedbackList: results
        });
    });
});

app.post('/feedback/submit', checkAuthenticated, (req, res) => {
    const { category, comments } = req.body;
    const sql = "INSERT INTO Feedback (category, comments) VALUES (?, ?)";
    
    db.query(sql, [category, comments], (err, result) => {
        if (err) throw err;
        
        req.flash('success', 'Feedback submitted successfully!');
        res.redirect('/communityboard');
    });
});

app.get('/communityboard', checkAuthenticated, (req, res) => {
    const sql = "SELECT * FROM Feedback ORDER BY date DESC";
    
    db.query(sql, (err, results) => {
        if (err) throw err;
        
        res.render('communityboard', {
            user: req.session.user,
            feedbackList: results
        });
    });
});


app.get('/return', checkAuthenticated, (req, res) => {
  const sql = `
    SELECT b.BorrowedId, b.ComicId, b.BorrowedQty, b.BorrowedDate, b.DueDate, c.Title, c.IssueNo 
    FROM Borrowed b
    JOIN Comics c ON b.ComicId = c.ComicId
    WHERE b.UserId = ?
  `;

  db.query(sql, [req.session.user.UserId], (err, results) => {
    if (err) throw err;
    res.render('return', { 
      borrowedComics: results, 
      user: req.session.user, 
      errors: req.flash('error') 
    });
  });
});


app.post('/return/:borrowedId', checkAuthenticated, (req, res) => {
  const borrowedId = req.params.borrowedId;
  const returnQty = Number.parseInt(req.body.quantity, 10) || 1;
  const userId = req.session.user.UserId;

  
  db.query('SELECT * FROM Borrowed WHERE BorrowedId = ? AND UserId = ?', [borrowedId, userId], (err, results) => {
    if (err) throw err;
    if (results.length === 0) {
      req.flash('error', 'Borrow record not found.');
      return res.redirect('/return');
    }

    const record = results[0];
    if (returnQty > record.BorrowedQty) {
      req.flash('error', 'You cannot return more copies than you borrowed.');
      return res.redirect('/return');
    }

   
    db.query('UPDATE Comics SET Quantity = Quantity + ? WHERE ComicId = ?', [returnQty, record.ComicId], (updateErr) => {
      if (updateErr) throw updateErr;


      if (returnQty === record.BorrowedQty) {
        db.query('DELETE FROM Borrowed WHERE BorrowedId = ?', [borrowedId], (deleteErr) => {
          if (deleteErr) throw deleteErr;
          req.flash('success', 'Comic returned successfully.');
          res.redirect('/comics');
        });
      } else {
        db.query('UPDATE Borrowed SET BorrowedQty = BorrowedQty - ? WHERE BorrowedId = ?', [returnQty, borrowedId], (borrowUpdateErr) => {
          if (borrowUpdateErr) throw borrowUpdateErr;
          req.flash('success', 'Partial quantity returned successfully.');
          res.redirect('/return');
        });
      }
    });
  });
});

app.get('/search', checkAuthenticated, (req, res) => {
    const searchTerm = req.query.query || '';
    db.query(
        'SELECT * FROM Comics WHERE Title LIKE ?',
        [`%${searchTerm}%`],
        (err, results) => {
            if (err) throw err;
            res.render('search-results', {
                comics: results,
                searchQuery: searchTerm,
                user: req.session.user
            });
        }
    );
});

app.get('/membership', checkAuthenticated, (req, res) => {
    db.query('SELECT * FROM Users WHERE userId > 0 ', (err, results) => {
        if (err) throw err;
        res.render('membership', {users: results, user: req.session.user, errors: req.flash('error') });
    });
});

app.listen(process.env.PORT || 3000, () => console.log('Server started on http://localhost:3000'));