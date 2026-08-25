resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-db"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-db"
  engine         = "postgres"
  engine_version = "16"

  instance_class         = var.db_instance_class
  allocated_storage      = var.db_allocated_storage_gb
  storage_type           = "gp3"
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  db_name  = "logit"
  username = "logit"
  password = var.db_password

  publicly_accessible       = false
  multi_az                  = false # flip to true once real users depend on this — doubles the cost
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project_name}-db-final"

  backup_retention_period = 7

  tags = {
    Name        = "${var.project_name}-db"
    Environment = var.environment
  }
}
