-- Reference dataset only. Use the Super Admin setup action for the hosted Site.
INSERT OR IGNORE INTO programmes(id,name,description,age_group) VALUES ('taekwondo','Taekwondo','Technique, discipline and a clear path through the belts.','Children, teens & adults');
INSERT OR IGNORE INTO programmes(id,name,description,age_group) VALUES ('mma','Mixed Martial Arts','Build coordinated striking, movement and conditioning.','Teens & adults');
INSERT OR IGNORE INTO programmes(id,name,description,age_group) VALUES ('self-defence','Self Defence','Practical awareness, movement and confidence.','Adults');
INSERT OR IGNORE INTO belt_levels(id,name,rank) VALUES ('white','White',0),('yellow','Yellow',1),('green','Green',2),('blue','Blue',3),('red','Red',4),('black','Black',5);
INSERT OR IGNORE INTO roles(name) VALUES ('Super Admin'),('Admin'),('Coach'),('Parent'),('Student');
