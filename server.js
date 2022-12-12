const HTTP_PORT = process.env.PORT || 8080;
const express = require("express");
const exphbs = require("express-handlebars");
const path = require("path");
const multer = require("multer");
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt = require('bcryptjs');
const clientSessions = require("client-sessions");
mongoose.set('strictQuery', true);

mongoose.connect('mongodb://127.0.0.1:27017/web322-final');
var db=mongoose.connection;
db.on('error', console.log.bind(console, "connection error"));
db.once('open', function(callback){
    console.log("connection succeeded");
})

const userSchema = new Schema({
    "userName": {
        "type": String,
        "unique":true
    },
    "firstName": String,
    "lastName": String,
    "email": {
        "type": String,
        "unique":true
    },
    "phone": String,
    "address": String,
    "addressLine2":String,
    "city":String,
    "province":String,
    "postal":String,
    "country":String,
    "passHash":String,
    "isAdmin":{
        "type":Boolean,
        "default":false
    }
});

const articleSchema = new Schema({
    "headline": String,
    "content": String,
    "date":Date,
    "author":String,
    "image":Buffer
});

const commentSchema = new Schema({
    "articleID" : String,
    "name" : {
        "type": String,
        "default": 'Anonymous'
    },
    "email" : String,
    "comment" : String,
    "date" : Date
});

var User = new mongoose.model('users',userSchema);
var Article = new mongoose.model('articles',articleSchema);
var Comment = new mongoose.model('comments',commentSchema);

const app = express();
app.use(express.static("static"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const storage = multer.memoryStorage()
const upload = multer({storage:storage});

function ensureLogin(req, res, next) {
    if (!req.session.user) {
      res.redirect("/login");
    } else {
      next();
    }
  }

function ensureAdmin(req, res, next){
    if (req.session.user)
    {
        User.findById(req.session.user.id).lean().exec().then((user) => {
            if (user.isAdmin)
                next();
            else res.status(403);
        })
    }
    else res.redirect("/login");
}

function checkLogin(req, res, next){
    if (req.session.user)
    {
        User.findById(req.session.user.id).lean().exec().then((user) => {
            req.userData = user;
            next();
        })
    }
    else next();
}

app.engine(".hbs", exphbs.engine({ extname: ".hbs" }));
app.set("view engine", ".hbs");

app.get("/", (req,res)=>{
    res.redirect("/blog");
})

app.get("/login", (req,res) => {
    res.render('login', {title:'Nimesh Panchal Login'});
});

app.post("/login-user", upload.none(), (req, res) => {
    const data = req.body;
    if (data.username && data.password){
        User.findOne({userName:data.username}).exec().then((user) => {
            if (user){
                bcrypt.compare(data.password,user.passHash).then((matches) => {
                    if (matches)
                    {
                        req.session.user = { id: user._id };
                        res.redirect("/dashboard");
                    }
                    else res.render('login', {error :"password", error_msg:"Password incorrect."})
                });
            } 
            else res.render('login',{error :"username", error_msg:"No account found with this username."})
        });
    } else
        res.render('login',{error: "missing_vals", error_msg:"Please fill in username and password."});
});

app.get("/dashboard", upload.none(), ensureLogin, (req, res) =>
{
    User.findById(req.session.user.id).lean().exec().then((user) => {
            let data = {user:user};
            if (user.isAdmin) {
                Article.find().sort({date:"desc"}).lean().exec().then((articles) => {
                        data['articles'] = articles;
                        res.render('dashboard',data);
                });
            }
            else
                res.render('dashboard',data);
    });
});

app.get("/registration", (req,res) => {
    res.render('registration');
});

app.post("/register-user", upload.none(), (req,res) =>{
    const data = req.body;
    const formVals = [ data.username, data.firstName, data.lastName, data.email, data.phone, data.address, data.city,data.province,data.postal,data.country,data.password,data.password2 ];
    
    if (formVals.some(x=>!x))
    {
        res.json({error: "missing_vals", error_msg:"Please fill in all required fields."});
    }
    else {
        const phonePattern = /([0-9]{3}-){2}[0-9]{4}/;
        const passPatterns = [/[!?<>!@#$%^&*]/, /.{8}/, /[0-9]/];

        let passMatch = passPatterns.every(x=>x.test(data.password));
        
        if (!phonePattern.test(data.phone)) 
            res.json({error:"phone",error_msg:"Phone format must be like: 123-456-7890"});
        else if (!passMatch) 
            res.json({error:"password",error_msg:"Password must contain at least: 8 characters, 1 number, and 1 symbol (!?<>!@#$%^&*)"});
        else if (data.password != data.password2)
            res.json({error:"password",error_msg:"Both password fields must match."});
        else{
            User.findOne({$or:[{email:data.email},{userName:data.username}]}).exec().then((user)=>{
                if (user)
                {
                    if (user.userName == data.username)
                        res.json({error:"username",error_msg:"There is already an account with this username."});
                    else              
                        res.json({error:"email",error_msg:"There is already an account associated with this email."});      
                }
                else 
                {
                    bcrypt.hash(data.password,12).then((hash)=>{
                        let user = new User({
                            userName:data.username,
                            firstName: data.firstName,
                            lastName: data.lastName,
                            email:data.email,
                            phone:data.phone,
                            address:data.address,
                            addressLine2:data.address2,
                            city:data.city,
                            province:data.province,
                            postal:data.postal,
                            country:data.country,
                            passHash:hash
                        });
                        user.save().then(() => {
                            User.findOne({userName:data.username}).exec().then((u)=>{
                                req.session.user = { id: u._id };
                                res.json({success:true})
                            });

                        });
                    });
                    
                }
            });
        }
    }
});

app.get("/blog", checkLogin, (req,res) => {
    Article.find().sort({date:"desc"}).exec().then((articles)=>{
        articles = articles.map(value => {
            
            let v = value.toObject()
            
            v.image = v.image.toString('base64');
            v.content = v.content.substring(0,70) + '...';
            return v;
        });
        
        let pageData = {data:articles};
        if (req.userData) pageData["user"] = req.userData;
        
        res.render('blog', pageData);
    });
});

app.get("/article/:id",checkLogin, (req,res) => {
    Article.findById(req.params.id).lean().exec().then((article)=>{
        if (article) {

            Comment.find({articleID:article._id}).sort({date:"asc"}).lean().exec().then((comments) =>{
                comments.map(c=>{
                    c.date = c.date.toLocaleString("en-US");
                    return c;
                });

                article.image = article.image.toString('base64');
                let pageData = {article:article, comments:comments};
                if (req.userData) pageData["user"] = req.userData;
                    res.render('read_more', pageData);
            });
        } else res.render('error', {error:"Article not found."});
    });
});

app.post("/comment", upload.none(), (req,res) => {
    const data = req.body;
    if (data.comment && data.email && data.articleID){
        Article.findOne({_id:data.articleID}).exec().then((article)=>{
            if (article){
                if (data.name == '') data.name = undefined;
                new Comment({
                    comment: data.comment,
                    email: data.email,
                    name: data.name,
                    date: Date.now(),
                    articleID: article._id
                }).save().then(()=>{
                    res.redirect('back');
                });
            } else res.status(400);
        });
        
    }

});

app.get("/create-article", ensureAdmin, checkLogin, (req,res) =>{
    res.render('createArticle', {user: req.userData} );
});

app.get("/edit-article/:id", ensureAdmin, checkLogin, (req,res) =>{
    Article.findById(req.params.id).lean().exec().then((article)=>{
        res.render('editArticle', {user: req.userData, article:article} );
    });
});

app.post("/save-article", ensureAdmin, upload.single("image"), (req,res) =>{    
    const data = req.body;
    if (data.title && data.author && data.content){
        if (data.id) // update, not create new
        { 
            Article.findOneAndUpdate({_id:data.id}, {
                headline:data.title,
                author:data.author,
                content:data.content
            }).then((article)=>{
                res.redirect('/article/' + article._id);
            });
        } 
        else // create new
        {
            new Article({
                headline:data.title,
                author:data.author,
                image: req.file.buffer,
                date:Date.now(),
                content:data.content
            }).save().then((article)=>{
                res.redirect('/article/' + article._id);
            });
        }
    } else res.send("Missing article content.");
});

app.get("/logout", function(req, res) {
    req.session.reset();
    res.redirect("/login");
  });

app.listen(HTTP_PORT);
